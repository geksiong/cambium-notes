import type {
  GitCommitInfo,
  GitStatus,
  GitStatusEntry,
} from "../src-core/types.ts";

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

async function runGit(
  cwd: string,
  args: string[],
  timeoutMs = 60_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const cmd = new Deno.Command("git", {
    cwd,
    args,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  });
  const child = cmd.spawn();
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  try {
    const { code, stdout, stderr } = await child.output();
    return {
      code,
      stdout: new TextDecoder().decode(stdout),
      stderr: new TextDecoder().decode(stderr),
    };
  } finally {
    clearTimeout(timer);
    await child.status.catch(() => undefined);
  }
}

export async function requireGit(cwd: string): Promise<boolean> {
  try {
    const r = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return r.code === 0 && r.stdout.trim() === "true";
  } catch {
    throw new GitError(
      "git CLI not found on PATH. Install git (https://git-scm.com).",
    );
  }
}

function fail(r: { stderr: string }, action: string): never {
  throw new GitError(
    `git ${action} failed: ${r.stderr.trim() || "unknown error"}`,
  );
}

export async function status(cwd: string): Promise<GitStatus> {
  if (!(await requireGit(cwd))) {
    return { isRepo: false, branch: null, remoteUrl: null, entries: [] };
  }
  const [porcelain, branchRes] = await Promise.all([
    runGit(cwd, ["status", "--porcelain=v1"]),
    runGit(cwd, ["branch", "--show-current"]),
  ]);
  if (porcelain.code !== 0) fail(porcelain, "status");
  const entries: GitStatusEntry[] = [];
  for (const line of porcelain.stdout.split("\n")) {
    if (!line.trim()) continue;
    entries.push({
      x: line.slice(0, 1),
      y: line.slice(1, 2),
      path: line.slice(3).replace(/^"|"$/g, ""),
    });
  }
  const remote = await runGit(cwd, [
    "remote",
    "get-url",
    "origin",
  ]).catch(() => null);
  return {
    isRepo: true,
    branch: branchRes.stdout.trim() || null,
    remoteUrl: remote && remote.code === 0 ? remote.stdout.trim() : null,
    entries,
  };
}

export async function init(cwd: string): Promise<void> {
  const r = await runGit(cwd, ["init"]);
  if (r.code !== 0) fail(r, "init");
}

export async function stageAll(cwd: string): Promise<void> {
  const r = await runGit(cwd, ["add", "-A"]);
  if (r.code !== 0) fail(r, "add");
}

export async function commit(
  cwd: string,
  message: string,
): Promise<string> {
  await stageAll(cwd);
  const r = await runGit(cwd, ["commit", "-m", message]);
  if (r.code !== 0) {
    if (/nothing to commit/.test(r.stdout + r.stderr)) {
      throw new GitError("Nothing to commit.");
    }
    fail(r, "commit");
  }
  const hash = await runGit(cwd, ["rev-parse", "--short", "HEAD"]);
  return hash.stdout.trim();
}

export async function log(cwd: string, n = 20): Promise<GitCommitInfo[]> {
  const r = await runGit(cwd, [
    "log",
    `--max-count=${n}`,
    "--date-format=%s",
    "--pretty=format:%H%x01%an%x01%at%x01%s",
  ]);
  if (r.code !== 0) return [];
  return r.stdout.split("\n").filter(Boolean).map((line) => {
    const [hash, author, time, message] = line.split("\u0001");
    return { hash, author, time: Number(time) * 1000, message };
  });
}

export async function push(cwd: string): Promise<string> {
  const branch = await currentBranch(cwd);
  const args = branch && branch !== "main" && branch !== "master"
    ? ["push", "-u", "origin", branch]
    : ["push"];
  const r = await runGit(cwd, args, 120_000);
  if (r.code !== 0) fail(r, "push");
  return (r.stderr || r.stdout).trim() || "Pushed.";
}

export async function pull(cwd: string): Promise<string> {
  const r = await runGit(cwd, ["pull", "--rebase"], 120_000);
  if (r.code !== 0) fail(r, "pull");
  return (r.stdout || r.stderr).trim() || "Up to date.";
}

export async function setRemote(
  cwd: string,
  url: string,
): Promise<void> {
  const existing = await runGit(cwd, ["remote", "get-url", "origin"]);
  const r = existing.code === 0
    ? await runGit(cwd, ["remote", "set-url", "origin", url])
    : await runGit(cwd, ["remote", "add", "origin", url]);
  if (r.code !== 0) fail(r, "remote");
}

export async function currentBranch(cwd: string): Promise<string | null> {
  const r = await runGit(cwd, ["branch", "--show-current"]);
  return r.code === 0 ? r.stdout.trim() || null : null;
}
