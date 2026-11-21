import {
  BracketsAngle,
  CodeBlock,
  Code,
  ImageSquare,
  LinkSimple,
  ListBullets,
  ListNumbers,
  Minus,
  Quotes,
  TextB,
  TextHOne,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TextT,
} from "@phosphor-icons/react";
import { Extension } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Suggestion from "@tiptap/suggestion";
import { useEffect, useMemo, useRef, useState } from "react";
import { CODE_LANGS } from "../codeLangs.js";
import { Linkify } from "../linkify.js";
import { HtmlBlock } from "./HtmlBlock.jsx";

const BLOCKS = [
  { title: "Text", icon: TextT, keys: "paragraph p", run: (c) => c.setParagraph() },
  { title: "Heading 1", icon: TextHOne, keys: "h1 title", run: (c) => c.setHeading({ level: 1 }) },
  { title: "Heading 2", icon: TextHTwo, keys: "h2 subtitle", run: (c) => c.setHeading({ level: 2 }) },
  { title: "Bulleted list", icon: ListBullets, keys: "ul bullet", run: (c) => c.toggleBulletList() },
  { title: "Numbered list", icon: ListNumbers, keys: "ol number", run: (c) => c.toggleOrderedList() },
  { title: "Quote", icon: Quotes, keys: "blockquote", run: (c) => c.toggleBlockquote() },
  { title: "Code block", icon: CodeBlock, keys: "pre code", run: (c) => c.toggleCodeBlock() },
  { title: "Divider", icon: Minus, keys: "hr line rule", run: (c) => c.setHorizontalRule() },
  { title: "HTML block", icon: BracketsAngle, keys: "html raw", run: (c) => c.insertHtmlBlock() },
  { title: "Image", icon: ImageSquare, keys: "picture photo", run: (c) => c, image: true },
];

function makeSlash(setMenu, menuRef) {
  return Extension.create({
    name: "slash",
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: "/",
          startOfLine: false,
          allowSpaces: false,
          items: ({ query }) => {
            const q = query.toLowerCase();
            return BLOCKS.filter((b) => `${b.title} ${b.keys}`.toLowerCase().includes(q));
          },
          command: ({ editor, range, props }) => {
            const chain = editor.chain().focus().deleteRange(range);
            props.run(chain).run();
            if (props.image) editor.storage.slash?.pickImage?.();
          },
          render: () => ({
            onStart: (p) => setMenu({ items: p.items, index: 0, rect: p.clientRect?.(), command: p.command }),
            onUpdate: (p) =>
              setMenu((m) => ({ items: p.items, index: Math.min(m?.index || 0, Math.max(p.items.length - 1, 0)), rect: p.clientRect?.(), command: p.command })),
            onKeyDown: ({ event }) => {
              const m = menuRef.current;
              if (!m?.items.length) return false;
              if (event.key === "ArrowDown") {
                setMenu({ ...m, index: (m.index + 1) % m.items.length });
                return true;
              }
              if (event.key === "ArrowUp") {
                setMenu({ ...m, index: (m.index - 1 + m.items.length) % m.items.length });
                return true;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                m.command(m.items[m.index]);
                return true;
              }
              if (event.key === "Escape") {
                setMenu(null);
                return true;
              }
              return false;
            },
            onExit: () => setMenu(null),
          }),
        }),
      ];
    },
  });
}

function Mark({ icon: Icon, label, active, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`em-bubble-btn${active ? " is-active" : ""}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Icon size={16} />
    </button>
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

export function RichEditor({ value, onUpdate, placeholder, onEditorReady, onFiles, onPickImage }) {
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null);
  menuRef.current = menu;
  const slash = useMemo(() => makeSlash(setMenu, menuRef), []);
  const readyRef = useRef(onEditorReady);
  readyRef.current = onEditorReady;
  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow" } }),
      Image.configure({ allowBase64: false, HTMLAttributes: { class: "em-rt-img" } }),
      HtmlBlock,
      Linkify,
      Placeholder.configure({ placeholder: placeholder || "Write, or type / for blocks" }),
      slash,
    ],
    content: value || "",
    onCreate: ({ editor: ed }) => {
      ed.commands.linkifyAll();
      readyRef.current?.(ed);
    },
    onBlur: ({ editor: ed }) => ed.commands.linkifyAll(),
    onUpdate: ({ editor: ed }) => updateRef.current?.({ html: ed.getHTML(), text: ed.getText() }),
    editorProps: {
      handlePaste: (_view, event) => {
        if (!onFiles) return false;
        const files = filesFrom(event.clipboardData);
        if (!files.length) return false;
        event.preventDefault();
        event.stopPropagation();
        onFiles(files, "paste");
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved || !onFiles) return false;
        const files = filesFrom(event.dataTransfer);
        if (!files.length) return false;
        event.preventDefault();
        event.stopPropagation();
        onFiles(files, "drop");
        return true;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.storage.slash = { pickImage: onPickImage };
  }, [editor, onPickImage]);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  if (!editor) return <div className="em-rt" />;

  function openLink() {
    setLinkUrl(editor.getAttributes("link").href || "");
    setLinkOpen(true);
  }

  function applyLink(e) {
    e.preventDefault();
    const url = linkUrl.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (url) chain.setLink({ href: /^[a-z]+:/i.test(url) ? url : `https://${url}` }).run();
    else chain.unsetLink().run();
    setLinkOpen(false);
  }

  return (
    <div className="em-rt">
      <BubbleMenu
        editor={editor}
        className="em-bubble"
        options={{ placement: "top", offset: 8 }}
        shouldShow={({ editor: ed, from, to }) => from !== to && !ed.isActive("codeBlock") && !ed.isActive("htmlBlock")}
      >
        {linkOpen ? (
          <form className="em-bubble-link" onSubmit={applyLink}>
            <input
              autoFocus
              value={linkUrl}
              placeholder="Paste a link"
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setLinkOpen(false);
                  editor.commands.focus();
                }
              }}
              onBlur={() => setLinkOpen(false)}
            />
          </form>
        ) : (
          <>
            <Mark icon={TextB} label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
            <Mark icon={TextItalic} label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
            <Mark icon={TextStrikethrough} label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
            <Mark icon={Code} label="Code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} />
            <span className="em-bubble-sep" />
            <Mark icon={LinkSimple} label="Link" active={editor.isActive("link")} onClick={openLink} />
          </>
        )}
      </BubbleMenu>
      {menu?.items.length > 0 && menu.rect && (
        <div className="em-slash" style={{ left: menu.rect.left, top: menu.rect.bottom + 6 }} onMouseDown={(e) => e.preventDefault()}>
          {menu.items.map((b, i) => (
            <button
              type="button"
              key={b.title}
              className={`em-slash-item${i === menu.index ? " is-active" : ""}`}
              onMouseEnter={() => setMenu({ ...menu, index: i })}
              onClick={() => menu.command(b)}
            >
              <span className="em-slash-icon">
                <b.icon size={16} />
              </span>
              {b.title}
            </button>
          ))}
        </div>
      )}
      {editor.isActive("codeBlock") && (
        <select
          className="em-rt-lang"
          aria-label="Code language"
          value={editor.getAttributes("codeBlock").language || ""}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) =>
            editor.chain().focus().updateAttributes("codeBlock", { language: e.target.value || null }).run()
          }
        >
          <option value="">Plain text</option>
          {CODE_LANGS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      )}
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
