export type AiCommandId =
  | "summarize"
  | "critique"
  | "research"
  | "draft"
  | "continue"
  | "rewrite";

export type AiContextScope = "selection" | "note" | "note+backlinks";

export interface AiContextBundle {
  title: string;
  frontMatterYaml: string;
  body: string;
  selection?: string;
  backlinks?: { title: string; excerpt: string }[];
}

export interface AiCommand {
  id: AiCommandId;
  label: string;
  description: string;
  /** Build the user message for this command given a context bundle. */
  buildUser(ctx: AiContextBundle): string;
}

const SYSTEM = `You are Cambium, an assistant embedded in a markdown note-taking
and publishing app. You help with drafting, research, summarising and critique
of articles. Always answer in clean markdown. Be concrete and specific; when
critiquing, separate strengths from weaknesses and give actionable fixes.`;

function contextBlock(ctx: AiContextBundle): string {
  const parts: string[] = [];
  parts.push(`# Note: ${ctx.title}`);
  if (ctx.frontMatterYaml.trim()) {
    parts.push(`Frontmatter:\n\`\`\`yaml\n${ctx.frontMatterYaml}\n\`\`\``);
  }
  const scopeText = ctx.selection?.trim()
    ? ctx.selection
    : ctx.body || "(empty note)";
  parts.push(`Content:\n${scopeText}`);
  if (ctx.backlinks?.length) {
    const bl = ctx.backlinks
      .map((b) => `- ${b.title}: ${b.excerpt}`)
      .join("\n");
    parts.push(`Linking notes:\n${bl}`);
  }
  return parts.join("\n\n");
}

function requireContent(ctx: AiContextBundle, what: string): string | null {
  if (!ctx.selection?.trim() && !ctx.body.trim()) {
    return `_The current note is empty, so there is nothing to ${what} yet._`;
  }
  return null;
}

export const AI_COMMANDS: Record<AiCommandId, AiCommand> = {
  summarize: {
    id: "summarize",
    label: "Summarise",
    description: "Condense the note (or selection) into key points.",
    buildUser: (ctx) =>
      requireContent(ctx, "summarise") ??
        `Summarise the following into: one-sentence TL;DR, then 3-7 bullet
points of key ideas, then any open questions the text raises.\n\n${
          contextBlock(ctx)
        }`,
  },
  critique: {
    id: "critique",
    label: "Critique",
    description: "Editorial review: argument, structure, evidence.",
    buildUser: (ctx) =>
      requireContent(ctx, "critique") ??
        `Critique this piece as a demanding editor: assess the central claim,
structure, evidence and tone. List strengths, weaknesses, and the three most
impactful concrete improvements.\n\n${contextBlock(ctx)}`,
  },
  research: {
    id: "research",
    label: "Research",
    description: "Outline angles, counterarguments and sources to check.",
    buildUser: (ctx) =>
      `I am writing "${ctx.title}". Produce a research brief: key sub-questions,
angles I may be missing, likely counterarguments, and the kinds of sources or
data that would strengthen it. Use the draft below as grounding where helpful.

${contextBlock(ctx)}`,
  },
  draft: {
    id: "draft",
    label: "Draft",
    description: "Expand an outline or idea into a full draft.",
    buildUser: (ctx) =>
      `Draft a well-structured article from the outline/notes below.
Keep the voice practical. Output only the article body in markdown.

${contextBlock(ctx)}`,
  },
  continue: {
    id: "continue",
    label: "Continue",
    description: "Continue writing seamlessly from where the note ends.",
    buildUser: (ctx) =>
      requireContent(ctx, "continue") ??
        `Continue this text naturally for 2-4 paragraphs, matching its voice
and format exactly. Do not repeat existing content; start mid-thought if needed.

${contextBlock(ctx)}`,
  },
  rewrite: {
    id: "rewrite",
    label: "Rewrite",
    description: "Tighten and clarify the selected text.",
    buildUser: (ctx) =>
      requireContent(ctx, "rewrite") ??
        `Rewrite the text below to be clearer and tighter while preserving
meaning, markdown formatting, and any technical terms. Output only the rewrite.

${contextBlock(ctx)}`,
  },
};

export function systemPrompt(): string {
  return SYSTEM;
}
