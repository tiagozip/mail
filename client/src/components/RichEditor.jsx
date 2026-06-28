import { Button, Tooltip } from "@cloudflare/kumo";
import {
  Code,
  CodeBlock,
  LinkSimple,
  ListBullets,
  ListNumbers,
  Quotes,
  TextB,
  TextHOne,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
} from "@phosphor-icons/react";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

function ToolButton({ icon, label, active, onClick, disabled }) {
  return (
    <Tooltip content={label}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        shape="square"
        aria-label={label}
        aria-pressed={active}
        tabIndex={-1}
        className={`em-rt-tool${active ? " is-active" : ""}`}
        icon={icon}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
      />
    </Tooltip>
  );
}

function filesFrom(dt) {
  const out = [];
  for (const f of dt?.files || []) out.push(f);
  if (!out.length) {
    for (const it of dt?.items || []) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) out.push(f);
      }
    }
  }
  return out;
}

export function RichEditor({ value, onUpdate, placeholder, onEditorReady, onFiles }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow" } }),
      Placeholder.configure({ placeholder: placeholder || "Write your message" }),
    ],
    content: value || "",
    onUpdate: ({ editor: ed }) => onUpdate?.({ html: ed.getHTML(), text: ed.getText() }),
    editorProps: {
      handlePaste: (_view, event) => {
        if (!onFiles) return false;
        const files = filesFrom(event.clipboardData);
        if (!files.length) return false;
        event.preventDefault();
        event.stopPropagation();
        onFiles(files);
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved || !onFiles) return false;
        const files = filesFrom(event.dataTransfer);
        if (!files.length) return false;
        event.preventDefault();
        event.stopPropagation();
        onFiles(files);
        return true;
      },
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  if (!editor) return <div className="em-rt" />;

  function toggleLink() {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const prev = editor.getAttributes("link").href || "";
    const url = window.prompt("Link URL", prev);
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <div className="em-rt">
      <div className="em-rt-toolbar">
        <ToolButton
          icon={TextB}
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolButton
          icon={TextItalic}
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolButton
          icon={TextStrikethrough}
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <span className="em-rt-sep" />
        <ToolButton
          icon={TextHOne}
          label="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolButton
          icon={TextHTwo}
          label="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <span className="em-rt-sep" />
        <ToolButton
          icon={ListBullets}
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolButton
          icon={ListNumbers}
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolButton
          icon={Quotes}
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolButton
          icon={Code}
          label="Inline code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
        <ToolButton
          icon={CodeBlock}
          label="Code block"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
        <span className="em-rt-sep" />
        <ToolButton icon={LinkSimple} label="Link" active={editor.isActive("link")} onClick={toggleLink} />
      </div>
      <EditorContent
        className="em-rt-content"
        editor={editor}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          e.preventDefault();
          if (e.shiftKey) {
            if (editor.can().liftListItem("listItem")) {
              editor.chain().focus().liftListItem("listItem").run();
            }
            return;
          }
          if (editor.can().sinkListItem("listItem")) {
            editor.chain().focus().sinkListItem("listItem").run();
            return;
          }
          editor.chain().focus().insertContent("\t").run();
        }}
      />
    </div>
  );
}
