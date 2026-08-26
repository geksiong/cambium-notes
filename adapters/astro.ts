import * as path from "@std/path";
import { stringify as stringifyYaml } from "yaml";
import { slugify } from "../src-core/links.ts";
import { isDraft } from "../src-core/frontmatter.ts";
import type { PublishProfile } from "../src-core/types.ts";
import { indexCollection } from "./workspace.ts";

export class PublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishError";
  }
}

export function siteDirFor(collectionRoot: string): string {
  return `${path.resolve(collectionRoot)}-site`;
}

async function run(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs = 600_000,
): Promise<string> {
  const child = new Deno.Command(cmd, {
    cwd,
    args,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  try {
    const out = await child.output();
    const stdout = new TextDecoder().decode(out.stdout);
    const stderr = new TextDecoder().decode(out.stderr);
    if (!out.success) {
      throw new PublishError(
        `\`${cmd} ${args.join(" ")}\` failed:\n${stderr || stdout}`.slice(
          0,
          4000,
        ),
      );
    }
    return stdout;
  } finally {
    clearTimeout(timer);
    await child.status.catch(() => undefined);
  }
}

// ---------------------------------------------------------------- starter

interface StarterFile {
  [relPath: string]: string;
}

const STARTER: StarterFile = {
  "package.json": JSON.stringify(
    {
      name: "cambium-site",
      type: "module",
      version: "0.0.1",
      scripts: {
        dev: "astro dev",
        build: "astro build",
        preview: "astro preview",
      },
      dependencies: {
        astro: "^5.1.1",
        "astro-expressive-code": "^0.44.1",
      },
    },
    null,
    2,
  ),
  "astro.config.mjs": `import { defineConfig } from 'astro/config';
import expressiveCode from 'astro-expressive-code';

// For GitHub Pages project sites set site + base, e.g.:
//   site: 'https://<user>.github.io', base: '/<repo>'
export default defineConfig({
  site: 'https://example.com',
  // Renders fenced code blocks with Expressive Code — the same opening
  // fence features (line/text markers, titles, wrap, themes) that the
  // Cambium editor previews live.
  integrations: [expressiveCode()],
});
`,
  "src/content.config.ts": `import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
`,
  "src/layouts/Base.astro": `---
const { title = 'Cambium' } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <style is:global>
      body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.6; }
      a { color: #0969da; }
      h1, h2 { line-height: 1.2; }
    </style>
  </head>
  <body>
    <slot />
  </body>
</html>
`,
  "src/pages/index.astro": `---
import { getCollection } from 'astro:content';
import Base from '../layouts/Base.astro';

const all = await getCollection('posts');
const posts = all
  .filter((p) => (import.meta.env.PROD ? !p.data.draft : true))
  .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
---
<Base title="Home">
  <h1>Posts</h1>
  <ul>
    {posts.map((p) => (
      <li>
        <a href={\`/posts/\${p.id}/\`}>{p.data.title}</a>
        <time>{p.data.date.toISOString().slice(0, 10)}</time>
      </li>
    ))}
  </ul>
</Base>
`,
  "src/pages/posts/[...id].astro": `---
import { getCollection, render } from 'astro:content';
import Base from '../../layouts/Base.astro';

export async function getStaticPaths() {
  const posts = await getCollection('posts');
  return posts.map((entry) => ({ params: { id: entry.id }, props: { entry } }));
}

const { entry } = Astro.props;
const { Content } = await render(entry);
---
<Base title={entry.data.title}>
  <article>
    <h1>{entry.data.title}</h1>
    <time>{entry.data.date.toISOString().slice(0, 10)}</time>
    <Content />
  </article>
</Base>
`,
};

/** Scaffold `<collection>-site` if it does not exist yet. */
export async function ensureSite(collectionRoot: string): Promise<string> {
  const site = siteDirFor(collectionRoot);
  try {
    const st = await Deno.stat(path.join(site, "package.json"));
    if (st.isFile) return site;
  } catch {
    // fall through to scaffold
  }
  for (const [rel, contents] of Object.entries(STARTER)) {
    const abs = path.join(site, rel);
    await Deno.mkdir(path.dirname(abs), { recursive: true });
    await Deno.writeTextFile(abs, contents);
  }
  return site;
}

// ------------------------------------------------------------------- sync

function convertWikilinks(body: string, slugs: Set<string>): string {
  return body.replace(
    /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,
    (_m, target, label) => {
      const slug = slugify(String(target).split("/").pop() ?? String(target));
      const text = label ?? String(target);
      return slugs.has(slug) ? `[${text}](/posts/${slug}/)` : text;
    },
  );
}

/**
 * Copies collection notes into the Astro content collection with a
 * normalised schema. Drafts are skipped unless profile.includeDrafts.
 */
export async function syncNotes(
  collectionRoot: string,
  profile: PublishProfile,
): Promise<{ written: number; skipped: number }> {
  const site = await ensureSite(collectionRoot);
  const dest = path.join(site, "src", "content", "posts");
  await Deno.mkdir(dest, { recursive: true });

  const { refs, bodies } = await indexCollection({
    ...emptyCollectionCfg(collectionRoot),
    publish: undefined,
  });
  const slugs = new Set(refs.map((r) => slugify(r.title)));
  let written = 0;
  let skipped = 0;

  for (const ref of refs) {
    const draft = isDraft(ref.fm);
    if (draft && !profile.includeDrafts) {
      skipped++;
      continue;
    }
    const fm = {
      title: ref.title,
      date: typeof ref.fm.date === "string"
        ? ref.fm.date
        : new Date(ref.mtime || Date.now()).toISOString().slice(0, 10),
      ...(typeof ref.fm.description === "string"
        ? { description: ref.fm.description }
        : {}),
      tags: ref.tags,
      draft,
    };
    const body = convertWikilinks(bodies.get(ref.path) ?? "", slugs);
    const slug = slugify(ref.title);
    await Deno.writeTextFile(
      path.join(dest, `${slug}.md`),
      `---\n${stringifyYaml(fm).trimEnd()}\n---\n\n${body}`,
    );
    written++;
  }
  return { written, skipped };
}

function emptyCollectionCfg(root: string) {
  return {
    id: "publish-sync",
    name: "",
    path: root,
    createdAt: new Date().toISOString(),
  };
}

// ------------------------------------------------------------------ build

type Pm = "npm" | "pnpm" | "yarn" | "bun";

async function detectPm(site: string): Promise<Pm> {
  const probe = async (pm: Pm) => {
    try {
      const c = new Deno.Command(pm, {
        args: ["--version"],
        stdout: "null",
        stderr: "null",
      });
      const st = await c.spawn().status;
      return st.success;
    } catch {
      return false;
    }
  };
  for (
    const [marker, pm] of [
      ["pnpm-lock.yaml", "pnpm"],
      ["yarn.lock", "yarn"],
      ["bun.lockb", "bun"],
    ] as const
  ) {
    if (await exists(path.join(site, marker)) && await probe(pm)) return pm;
  }
  if (!(await probe("npm"))) {
    throw new PublishError(
      "No JavaScript package manager found (need npm, pnpm, yarn or bun).",
    );
  }
  return "npm";
}

async function exists(p: string): Promise<boolean> {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function buildSite(collectionRoot: string): Promise<string> {
  const site = await ensureSite(collectionRoot);
  const pm = await detectPm(site);
  if (!(await exists(path.join(site, "node_modules")))) {
    await run(pm, ["install"], site, 900_000);
  }
  await run(pm, ["run", "build"], site, 900_000);
  const dist = path.join(site, "dist");
  if (!(await exists(dist))) {
    throw new PublishError("Build produced no dist/ directory.");
  }
  return dist;
}

// ----------------------------------------------------------------- deploy

/**
 * GitHub Pages deploy: clones the configured repo's gh-pages branch (or
 * creates an orphan one) into a temp dir, replaces its contents with dist/,
 * commits and pushes. Auth is delegated to the user's git credential helper.
 */
export async function deployGhPages(
  collectionRoot: string,
  repoUrl: string,
): Promise<string> {
  if (!repoUrl?.trim()) {
    throw new PublishError(
      "No repository URL configured. Set it in the Publish panel first.",
    );
  }
  const dist = await buildSite(collectionRoot);
  const tmp = await Deno.makeTempDir({ prefix: "cambium-pages-" });
  try {
    // Try cloning an existing gh-pages branch; fall back to an orphan repo.
    let cloned = false;
    try {
      await run(
        "git",
        ["clone", "--depth=1", "--branch", "gh-pages", repoUrl, "."],
        tmp,
        300_000,
      );
      cloned = true;
    } catch {
      await run("git", ["init", "-b", "gh-pages"], tmp);
      await run("git", ["remote", "add", "origin", repoUrl], tmp);
    }
    // Wipe previous contents (keep .git / .gitignore when cloned).
    for await (const e of Deno.readDir(tmp)) {
      if (e.name === ".git" || e.name === ".nojekyll") continue;
      await Deno.remove(path.join(tmp, e.name), { recursive: true });
    }
    for await (const e of Deno.readDir(dist)) {
      await Deno.rename(path.join(dist, e.name), path.join(tmp, e.name));
    }
    await Deno.writeTextFile(path.join(tmp, ".nojekyll"), "");
    await run("git", ["add", "-A"], tmp);
    try {
      await run(
        "git",
        ["commit", "-m", `Publish ${new Date().toISOString()}`],
        tmp,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/nothing to commit/i.test(msg)) throw e;
    }
    await run("git", ["push", "origin", "gh-pages"], tmp, 300_000);
    return cloned
      ? "Pushed updated gh-pages branch."
      : "Created and pushed new gh-pages branch.";
  } finally {
    await Deno.remove(tmp, { recursive: true }).catch(() => undefined);
  }
}

/** Netlify deploy via the Netlify CLI (requires prior `netlify login`). */
export async function deployNetlify(
  collectionRoot: string,
  siteId: string | undefined,
): Promise<string> {
  const dist = await buildSite(collectionRoot);
  try {
    await new Deno.Command("netlify", { args: ["--version"] }).spawn().status;
  } catch {
    throw new PublishError(
      "Netlify CLI not found. Install it with: npm i -g netlify-cli",
    );
  }
  const args = ["deploy", "--prod", "--dir", dist];
  if (siteId) args.push("--site", siteId);
  const out = await run("netlify", args, siteDirFor(collectionRoot));
  return out.trim();
}
