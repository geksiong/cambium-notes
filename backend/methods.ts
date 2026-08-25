import { AI_COMMANDS } from "../src-core/ai/commands.ts";
import type { AiCommandId } from "../src-core/ai/commands.ts";
import type { AiProviderConfig } from "../src-core/types.ts";
import type { CambiumService } from "./services.ts";

export type MethodTable = Record<
  string,
  (svc: CambiumService, args: any) => unknown | Promise<unknown>
>;

const THEMES = ["light", "dark", "auto"] as const;

export const METHODS: MethodTable = {
  "app.ping": () => ({ ok: true }),
  "app.version": (svc) => ({ version: svc.version() }),

  "settings.get": (svc) => svc.settings,
  "settings.updateAuthor": (svc, a: { authorName: string }) => {
    svc.settings.authorName = a.authorName;
    return svc.persistSettings();
  },
  "settings.setTheme": (svc, a: { theme: string }) => {
    if (!THEMES.includes(a?.theme as typeof THEMES[number])) {
      throw new Error(`Invalid theme: ${a?.theme}`);
    }
    return svc.setTheme(a.theme as typeof THEMES[number]);
  },
  "settings.upsertProvider": (svc, p: AiProviderConfig) =>
    svc.upsertProvider(p),
  "settings.removeProvider": (svc, a: { id: string }) =>
    svc.removeProvider(a.id),

  "collections.list": (svc) => svc.listCollections(),
  "collections.add": (svc, a: { path: string; name?: string }) =>
    svc.addCollection(a.path, a.name),
  "collections.remove": (svc, a: { id: string }) => svc.removeCollection(a.id),

  "fs.tree": (svc, a: { collectionId: string }) => svc.tree(a.collectionId),
  "note.read": (svc, a: { collectionId: string; path: string }) =>
    svc.readNote(a.collectionId, a.path),
  "note.write": (
    svc,
    a: { collectionId: string; path: string; text: string },
  ) => svc.writeNote(a.collectionId, a.path, a.text),
  "note.create": (
    svc,
    a: {
      collectionId: string;
      folder: string;
      title: string;
      templateId?: string;
      extraVars?: Record<string, string>;
    },
  ) =>
    svc.createNote(
      a.collectionId,
      a.folder,
      a.title,
      a.templateId,
      a.extraVars,
    ),
  "note.delete": (svc, a: { collectionId: string; path: string }) =>
    svc.deleteEntry(a.collectionId, a.path),
  "note.rename": (svc, a: { collectionId: string; from: string; to: string }) =>
    svc.renameEntry(a.collectionId, a.from, a.to),

  "templates.list": (svc, a?: { collectionId?: string }) =>
    svc.listTemplates(a?.collectionId),

  "graph.get": (svc, a?: { collectionId?: string }) =>
    svc.getGraph(a?.collectionId),

  "search.query": (svc, a: { q: string; collectionId?: string }) =>
    svc.search(a.q, a.collectionId),

  "ai.backlinks": (svc, a: { collectionId: string; path: string }) =>
    svc.backlinks(a.collectionId, a.path),
  "ai.commands": () =>
    Object.values(AI_COMMANDS).map((c) => ({
      id: c.id as AiCommandId,
      label: c.label,
      description: c.description,
    })),
  "ai.providers": (svc) =>
    svc.settings.aiProviders.map(({ apiKey: _k, ...safe }) => safe),

  "git.status": (svc, a: { collectionId: string }) =>
    svc.gitStatus(a.collectionId),
  "git.init": (svc, a: { collectionId: string }) => svc.gitInit(a.collectionId),
  "git.connectRemote": (svc, a: { collectionId: string; url: string }) =>
    svc.gitConnectRemote(a.collectionId, a.url),
  "git.commit": (svc, a: { collectionId: string; message: string }) =>
    svc.gitCommit(a.collectionId, a.message),
  "git.log": (svc, a: { collectionId: string; n?: number }) =>
    svc.gitLog(a.collectionId, a.n),
  "git.push": (svc, a: { collectionId: string }) => svc.gitPush(a.collectionId),
  "git.pull": (svc, a: { collectionId: string }) => svc.gitPull(a.collectionId),

  "publish.status": (svc, a: { collectionId: string }) =>
    svc.publishStatus(a.collectionId),
  "publish.saveProfile": (
    svc,
    a: { collectionId: string; profile: Record<string, unknown> },
  ) => svc.publishSaveProfile(a.collectionId, a.profile),
  "publish.createSite": (svc, a: { collectionId: string }) =>
    svc.publishCreateSite(a.collectionId),
  "publish.sync": (svc, a: { collectionId: string }) =>
    svc.publishSync(a.collectionId),
  "publish.build": (svc, a: { collectionId: string }) =>
    svc.publishBuild(a.collectionId),
  "publish.deploy": (svc, a: { collectionId: string }) =>
    svc.publishDeploy(a.collectionId),
};
