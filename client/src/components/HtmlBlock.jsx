import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { sanitize } from "lettersanitizer";
import { useState } from "react";

function enc(s) {
  return btoa(unescape(encodeURIComponent(s || "")));
}

function dec(s) {
  try {
    return decodeURIComponent(escape(atob(s || "")));
  } catch {
    return "";
  }
}

function HtmlBlockView({ node, updateAttributes, editor }) {
  const html = node.attrs.html || "";
  const [editing, setEditing] = useState(!html);
  return (
    <NodeViewWrapper className="em-htmlblock">
      <div className="em-htmlblock-bar" contentEditable={false}>
        <span className="em-htmlblock-tag">HTML</span>
        {editor.isEditable && (
          <button
            type="button"
            className="em-htmlblock-toggle"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Preview" : "Edit"}
          </button>
        )}
      </div>
      {editing ? (
        <textarea
          className="em-htmlblock-code"
          value={html}
          spellCheck={false}
          placeholder="<strong>Your HTML here</strong>"
          onChange={(e) => updateAttributes({ html: e.target.value })}
        />
      ) : html ? (
        <div
          className="em-htmlblock-preview"
          contentEditable={false}
          dangerouslySetInnerHTML={{
            __html: sanitize(html, undefined, {
              allowedSchemas: ["http", "https", "mailto", "tel", "cid", "data"],
            }),
          }}
        />
      ) : (
        <div className="em-htmlblock-empty" contentEditable={false}>
          Empty HTML block
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const HtmlBlock = Node.create({
  name: "htmlBlock",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { html: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-htmlblock]",
        getAttrs: (el) => ({ html: dec(el.getAttribute("data-htmlblock")) }),
      },
    ];
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-htmlblock": enc(node.attrs.html) })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(HtmlBlockView);
  },
  addCommands() {
    return {
      insertHtmlBlock:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },
});
