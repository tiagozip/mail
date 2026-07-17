# 006 — Reveal the label edit button on keyboard focus

- **Status**: DONE
- **Commit**: 5d06e6f
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file, ~4 lines

## Problem

`.em-label-edit` is `opacity: 0` and is revealed only by a hover on its parent row. It has no non-hover fallback of any kind.

```css
/* client/src/theme.css:3582 */
.em-label-edit {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin-right: 6px;
  border: none;
  background: none;
  border-radius: var(--em-radius-sm);
  color: var(--text-color-kumo-inactive);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity var(--em-fast),
    color var(--em-fast),
    background var(--em-fast);
}

.em-nav-labelrow:hover .em-label-edit {
  opacity: 1;
}
```

This is the pencil button on every sidebar label and user folder. `MailSidebar.jsx:119-125`:

```jsx
<button
  type="button"
  className="em-label-edit"
  aria-label={`Edit ${l.name}`}
  onClick={(e) => openEdit(l, e)}
>
```

and again at `MailSidebar.jsx:154` for folders.

Two consequences:

1. On touch, the button is permanently invisible. There is no hover, so `opacity` never leaves `0`. The edit affordance simply does not exist on a phone.
2. On keyboard, it is worse than invisible. The global focus ring at theme.css:3962 matches `button:focus-visible`, so tabbing through the sidebar draws a focus outline around a **button that cannot be seen**. In a keyboard-first email client, that is the wrong failure mode.

Every other reveal-on-hover affordance in this file pairs its hover selector with a state-class fallback. `.em-row:hover .em-row-check` (theme.css:896) pairs with `.em-row.is-selected .em-row-check` (899). `.em-row:hover .em-star-btn` pairs with `.em-star-btn.is-on` (1032). `.em-listhead:hover .em-listhead-check` pairs with `.is-shown` (611). Verified by grepping `:focus` across theme.css: `.em-label-edit` is the only one that missed it.

## Target

```css
.em-nav-labelrow:hover .em-label-edit,
.em-label-edit:focus-visible {
  opacity: 1;
}
```

`:focus-visible` rather than `:focus` is deliberate. `:focus` would also fire on mouse click, causing the button to stay revealed after the label editor dialog closes and focus returns. `:focus-visible` fires only for keyboard navigation, which is exactly the case that is broken.

The existing `transition` on `.em-label-edit` (theme.css:3595) already covers `opacity var(--em-fast)`, so the reveal animates at 120ms with no further change.

Expected end state: tabbing to the pencil button fades it in over 120ms, and the focus ring lands on something visible. Mouse hover behavior is completely unchanged.

## Scope note

This plan fixes the keyboard case only. **It does not fix the touch case**, where the button stays invisible because touch has neither hover nor `:focus-visible`. A real touch fix requires a product decision (always show the pencil at mobile widths, move editing into a long-press or an overflow menu, etc.) and a JSX change. That is out of scope here and should be raised separately.

## Repo conventions to follow

- The established pattern is a comma-separated selector list combining the hover reveal with its fallback. Exemplar at theme.css:896-899:
  ```css
  .em-row:hover .em-row-check {
    opacity: 1;
  }

  .em-row.is-selected .em-row-check {
    opacity: 1;
  }
  ```
  This repo writes them as separate rules there, but a single grouped selector is used elsewhere in the file and is preferred here since both selectors produce the identical declaration.
- The global focus ring lives at theme.css:3962 and already matches `button:focus-visible`. Do not add a second focus ring.

## Steps

1. In `client/src/theme.css`, find `.em-nav-labelrow:hover .em-label-edit { opacity: 1; }` at line 3601.
2. Change its selector to the grouped form `.em-nav-labelrow:hover .em-label-edit,\n.em-label-edit:focus-visible`, keeping the single `opacity: 1;` declaration.
3. Change nothing else.

## Boundaries

- Do NOT use `:focus`. It must be `:focus-visible`. See the Target section.
- Do NOT use `:focus-within` on `.em-nav-labelrow`. That would reveal the pencil whenever the row's main nav button is focused, which means tabbing through the sidebar flickers a pencil on every single row. Only the pencil's own focus should reveal it.
- Do NOT touch `.em-label-edit`'s base rule (theme.css:3582) or its `transition` list.
- Do NOT touch `.em-label-edit:hover` (theme.css:3605).
- Do NOT add a focus ring. The global one at theme.css:3962 already handles it.
- Do NOT attempt the touch fix. Read the Scope note.
- Do NOT touch `MailSidebar.jsx` or any other `.jsx` file.
- Do NOT add code comments. This repo forbids them.
- Do NOT add dependencies.
- If `.em-nav-labelrow:hover .em-label-edit` has declarations other than `opacity: 1`, STOP and report. The code has drifted from commit 5d06e6f.

## Verification

- **Mechanical**: `bun run build` must succeed.
- **Feel check**: run `bun run dev:client`.
  - Click into the page, then press Tab repeatedly to walk focus into the sidebar until it reaches a label's pencil button.
  - The pencil must fade in over roughly 120ms and be clearly visible, with the focus ring around a visible button.
  - Press Enter on it and confirm the label editor dialog opens as before.
  - Close the dialog. The pencil must fade back out (unless the mouse happens to be hovering the row).
  - Now click a pencil with the **mouse**. After the dialog closes, the pencil must NOT stay stuck visible once the pointer leaves the row. If it does, `:focus` was used instead of `:focus-visible`.
  - Tab through several sidebar rows in a row and confirm only the pencil that currently has focus is revealed, never a whole column of them. If multiple appear, `:focus-within` was used.
  - Hover a label row with the mouse and confirm the reveal is identical to before this change.
- **Done when**: keyboard focus reveals exactly one pencil at a time with a visible focus ring, mouse hover is unchanged, and no pencil stays stuck visible after a mouse click.
