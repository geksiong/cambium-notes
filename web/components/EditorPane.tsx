import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect } from "react";
import { FrontmatterPanel } from "./FrontmatterPanel.tsx";
import { editorRef, useStore } from "../state/store.ts";
import {
  buildExtensions,
  getMarkdown,
  imageResolveCtx,
} from "../editor/extensions.ts";

export function EditorPane() {
  const activeCollectionId = useStore((s) => s.activeCollectionId);
  const activePath = useStore((s) => s.activePath);
  const notes = useStore((s) => s.notes);
  const dirty = useStore((s) => s.dirty);
  const updateBody = useStore((s) => s.updateBody);

  const key = activeCollectionId && activePath
    ? `${activeCollectionId}:${activePath}`
    : null;
  const note = key ? notes[key] : undefined;
  const isDirty = key ? dirty.has(key) : false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onUpdateRef = useCallback<(md: string) => void>((md: string) => {
    if (activePath) updateBody(activePath, md);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, updateBody]);

  const editor = useEditor({
    extensions: buildExtensions(),
    content: "",
    onUpdate: ({ editor }) => onUpdateRef(getMarkdown(editor)),
  });

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) editorRef.current = null;
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || !note) return;
    imageResolveCtx.collectionId = activeCollectionId;
    imageResolveCtx.notePath = activePath;
    editor.commands.setContent(note.body, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, activeCollectionId]);

  if (!activeCollectionId) {
    imageResolveCtx.collectionId = null;
    imageResolveCtx.notePath = null;
    return (
      <div className="editor-empty muted">
        Add or select a collection to begin.
      </div>
    );
  }
  if (!note || !activePath) {
    imageResolveCtx.collectionId = null;
    imageResolveCtx.notePath = null;
    return (
      <div className="editor-empty muted">
        Open a note from the explorer, or create one with <b>+</b>.
      </div>
    );
  }

  const words = note.body.trim() ? note.body.trim().split(/\s+/).length : 0;

  return (
    <div className="editor-pane">
      <Toolbar editor={editor} />
      <FrontmatterPanel />
      <EditorContent editor={editor} className="prose-host" />
      <div className="editor-footer">
        <span>{activePath}</span>
        <span>
          {words} words · {isDirty ? "unsaved" : "saved"}
          {" · "}
          <button
            className="link"
            onClick={() => void useStore.getState().save()}
          >
            save now
          </button>
        </span>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Toolbar({ editor }: { editor: any }) {
  if (!editor) return null;
  const btn = (
    label: string,
    title: string,
    run: () => void,
    active = false,
  ) => (
    <button
      key={title + label}
      className={`tb ${active ? "on" : ""}`}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {label}
    </button>
  );
  return (
    <div className="toolbar">
      {btn("B", "Bold (Ctrl+B)", () =>
        editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
      {btn("I", "Italic (Ctrl+I)", () =>
        editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
      {btn("S", "Strikethrough", () =>
        editor.chain().focus().toggleStrike().run(), editor.isActive("strike"))}
      {btn(
        "H1",
        "Heading 1",
        () =>
          editor.chain().focus().toggleHeading({ level: 1 }).run(),
        editor.isActive("heading", { level: 1 }),
      )}
      {btn(
        "H2",
        "Heading 2",
        () =>
          editor.chain().focus().toggleHeading({ level: 2 }).run(),
        editor.isActive("heading", { level: 2 }),
      )}
      {btn(
        "H3",
        "Heading 3",
        () =>
          editor.chain().focus().toggleHeading({ level: 3 }).run(),
        editor.isActive("heading", { level: 3 }),
      )}
      {btn(
        "•",
        "Bullet list",
        () =>
          editor.chain().focus().toggleBulletList().run(),
        editor.isActive("bulletList"),
      )}
      {btn(
        "1.",
        "Numbered list",
        () =>
          editor.chain().focus().toggleOrderedList().run(),
        editor.isActive("orderedList"),
      )}
      {btn(
        "☑",
        "Checklist",
        () =>
          editor.chain().focus().toggleTaskList().run(),
        editor.isActive("taskList"),
      )}
      {btn(
        "❝",
        "Blockquote",
        () =>
          editor.chain().focus().toggleBlockquote().run(),
        editor.isActive("blockquote"),
      )}
      {btn("</>", "Inline code", () =>
        editor.chain().focus().toggleCode().run(), editor.isActive("code"))}
      {btn("—", "Horizontal rule", () =>
        editor.chain().focus().setHorizontalRule().run())}
      {btn("🔗", "Link", () => {
        const url = window.prompt("Link URL");
        if (url) {
          editor.chain().focus().setLink({ href: url }).run();
        }
      })}
    </div>
  );
}
