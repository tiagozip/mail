import { Extension } from "@tiptap/core";

const URL_RE =
  /\b(?:https?:\/\/|www\.)[^\s<>"'`]+|\b[\w.+-]+@[\w-]+\.[\w-]+(?:\.[\w-]+)*/gi;
const TRAILING = /[.,;:!?)\]}'"“”‘’]+$/;

function hrefFor(raw) {
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.includes("@")) return `mailto:${raw}`;
  return `https://${raw}`;
}

export const Linkify = Extension.create({
  name: "linkify",
  addCommands() {
    return {
      linkifyAll:
        () =>
        ({ state, tr, dispatch }) => {
          const mark = state.schema.marks.link;
          if (!mark) return false;
          const hits = [];
          state.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return;
            if (mark.isInSet(node.marks)) return;
            if (node.marks.some((m) => m.type.name === "code")) return;
            for (const m of node.text.matchAll(URL_RE)) {
              const raw = m[0].replace(TRAILING, "");
              if (raw.length < 4) continue;
              hits.push({ from: pos + m.index, to: pos + m.index + raw.length, href: hrefFor(raw) });
            }
          });
          if (!hits.length) return false;
          let applied = false;
          for (const hit of hits) {
            if (!tr.doc.resolve(hit.from).parent.type.allowsMarkType(mark)) continue;
            tr.addMark(hit.from, hit.to, mark.create({ href: hit.href }));
            applied = true;
          }
          if (applied && dispatch) dispatch(tr);
          return applied;
        },
    };
  },
});
