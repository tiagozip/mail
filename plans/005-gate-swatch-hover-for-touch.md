# 005 — Gate the swatch hover scale behind a real-hover query

- **Status**: DONE
- **Commit**: 5d06e6f
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file, ~4 lines

## Problem

`.em-swatch:hover` is the only rule in all 4309 lines of `client/src/theme.css` that **moves** something on hover, and it is not gated behind a hover-capability query.

```css
/* client/src/theme.css:3661 */
  transition:
    transform var(--em-fast),
    border-color var(--em-fast);
}

.em-swatch:hover {
  transform: scale(1.06);
}
```

These are the color-picker swatches in the folder and label editors. `FolderSetup.jsx:132-137`:

```jsx
<div className="em-swatch-grid">
  ...
  className={`em-swatch${color === c ? " is-selected" : ""}`}
```

and identically at `LabelModal.jsx:120-125`.

Touch devices fire a synthetic hover on tap, and it sticks until the user taps elsewhere. So on a phone, tapping a swatch leaves it held at `scale(1.06)`. Because these sit in a tight grid, a stuck-scaled neighbor reads as "selected" and competes with the actual `is-selected` border state, which is the real signal. The user gets two conflicting selection indicators.

There is no `@media (hover:` block anywhere in `client/src/theme.css`. Verified: `grep -c "hover: hover" client/src/theme.css` returns `0`. The only media queries in the file are `max-width` breakpoints (lines 1697, 1853, 3446, 3455, 3759) and the two `prefers-reduced-motion` blocks (426, 4107). The app is mobile-responsive, so these editors are reachable at phone widths.

Every other `:hover` rule in the file (`.em-row:hover` at 749, `.em-nav-item:hover` at 3510, `.em-att-chip:hover` at 1459, `.em-star-btn:hover` at 1037) changes only background, border, or color. Those are **not** in scope. The rule applies to hover *motion*, and colors that stick briefly on touch are harmless.

## Target

```css
@media (hover: hover) and (pointer: fine) {
  .em-swatch:hover {
    transform: scale(1.06);
  }
}
```

The `transition` list on `.em-swatch` (theme.css:3661) stays at the top level, unchanged and ungated. Only the `:hover` rule moves inside the query. The transition must remain available to touch users because plan 002 adds `.em-swatch:active` press feedback that depends on it.

Expected end state: on a mouse, hovering a swatch scales it up exactly as before. On touch, tapping a swatch does not scale it, and the only selection signal is the `is-selected` border.

## Repo conventions to follow

- `client/src/theme.css` places media queries inline near the rules they modify, not collected at the end of the file. See theme.css:3446 and theme.css:3455 for the existing pattern.
- Motion tokens live in `client/src/theme.css` `:root` (theme.css:21-23). This plan does not add or change a token.

## Steps

1. In `client/src/theme.css`, find `.em-swatch:hover { transform: scale(1.06); }` at line 3666.
2. Wrap it in `@media (hover: hover) and (pointer: fine) { ... }`, indenting the rule one level to match the file's existing media-query style at theme.css:3446.
3. Leave `.em-swatch`'s `transition` declaration (theme.css:3661) exactly where it is, at the top level.
4. Leave `.em-swatch.is-selected` (theme.css:3670) exactly where it is, at the top level.

## Boundaries

- Do NOT gate any other `:hover` rule in the file. Every other hover changes only color, background, or border, and those are correct as-is. This plan touches exactly one rule.
- Do NOT move the `transition` declaration inside the media query.
- Do NOT move `.em-swatch.is-selected` inside the media query. The selected state must render on touch.
- Do NOT touch `.em-swatch:active` if plan 002 has already added it. It must stay OUTSIDE this media query so press feedback works on touch.
- Do NOT change the `1.06` value.
- Do NOT touch any `.jsx` file.
- Do NOT add code comments. This repo forbids them.
- Do NOT add dependencies.
- If `.em-swatch:hover` contains declarations other than `transform`, STOP and report. The code has drifted from commit 5d06e6f.

## Verification

- **Mechanical**: `bun run build` must succeed. `grep -c "hover: hover" client/src/theme.css` must return `1`.
- **Feel check**: run `bun run dev:client` and open a folder or label editor to reach the swatch grid.
  - With a mouse: hovering a swatch must still scale it to 1.06 over 120ms, exactly as before.
  - In DevTools, open the device toolbar and switch to a touch device emulation (this makes `hover: hover` evaluate false). Tap a swatch. It must NOT scale. Confirm the `is-selected` border is the only thing that changes.
  - Still in touch emulation, tap several swatches in sequence and confirm no swatch is left visually enlarged.
  - If plan 002 has landed: in touch emulation, confirm the swatch still compresses on press. If it does not, the `:active` rule was incorrectly placed inside the media query.
- **Done when**: hover scale works with a mouse, does not fire under touch emulation, and the selected-state border is unaffected in both.
