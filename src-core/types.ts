export type FrontMatter = Record<string, unknown>;

export interface NoteRef {
  /** POSIX-style path relative to the collection root, no leading slash. */
  path: string;
  title: string;
  fm: FrontMatter;
  tags: string[];
  links: string[];
  mtime: number;
  collectionId: string;
}

export interface NoteContent {
  path: string;
  text: string;
  fmRaw: string | null;
  fm: FrontMatter;
  body: string;
}

export interface CollectionConfig {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  templateDir?: string;
  idFormat?: IdFormat;
  publish?: PublishProfile;
}

export type IdFormat = "zettel" | "timestamp" | "none";

export type PublishTarget = "github-pages" | "netlify";

export interface PublishProfile {
  enabled: boolean;
  mode: "adjacent-site";
  target: PublishTarget;
  repoUrl?: string;
  netlifySite?: string;
  includeDrafts?: boolean;
}

export type AiProviderType = "openai-compatible" | "anthropic" | "ollama";

export interface AiProviderConfig {
  id: string;
  name: string;
  type: AiProviderType;
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export type ThemePreference = "light" | "dark" | "auto";

export interface AppSettings {
  collections: CollectionConfig[];
  authorName: string;
  aiProviders: AiProviderConfig[];
  activeProviderId?: string;
  theme?: ThemePreference;
}

export interface GraphNode {
  id: string;
  label: string;
  collectionId: string;
  degree: number;
  tags: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface FileEntry {
  name: string;
  path: string;
  kind: "file" | "dir";
  mtime: number;
}

export interface GitStatusEntry {
  x: string;
  y: string;
  path: string;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  remoteUrl: string | null;
  entries: GitStatusEntry[];
}

export interface GitCommitInfo {
  hash: string;
  author: string;
  time: number;
  message: string;
}
