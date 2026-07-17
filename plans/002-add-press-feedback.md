# 002 — Add press feedback to custom pressable controls

- **Status**: DONE
- **Commit**: 5d06e6f
- **Severity**: HIGH
- **Category**: Physicality & origin
- **Estimated scope**: 1 file, ~7 small rule additions

## Problem

`client/src/theme.css` is 4309 lines and contains **zero `:active` rules**. Verified with `grep -c ":active" client/src/theme.css` which returns `0`. Every occurrence of the string "active" in the file is the `.is-active` state class, which is unrelated.

Every hand-rolled pressable control in the app therefore has hover feedback but nothing at all on press. The button changes color when the pointer arrives and then gives no acknowledgement whatsoever at the moment of the click. The audit rule is: pressable elements with no press feedback are a finding, and the fix is `transform: scale(0.97)` on `:active` with `transition: transform 160ms ease-out`, kept subtle in the 0.95 to 0.98 range.

The affected controls, each a plain `<button>` styled entirely by theme.css:

```css
/* client/src/theme.css:729 — the primary compose button, rendered at MessageList.jsx:408 */
  cursor: pointer;
  transition: background var(--em-fast);
```

```css
/* client/src/theme.css:1454 — the row star toggle, rendered in MessageList.jsx */
  transition:
```

```css
/* client/src/theme.css:3595 — sidebar folder/label nav items, rendered at MailSidebar.jsx:91 */
  transition:
    opacity var(--em-fast),
```

```css
/* client/src/theme.css:3661 — color swatch, rendered at FolderSetup.jsx:137 and LabelModal.jsx:125 */
  transition:
    transform var(--em-fast),
    border-color var(--em-fast);
```

```css
/* client/src/theme.css:3695 — rule toggle */
  transition:
```

```css
/* client/src/theme.css:4047 — segmented control button */
  transition:
```

`.em-swatch` is worth calling out: it already transitions `transform` for its hover `scale(1.06)` (theme.css:3666), so the machinery is present and it still has no press state.

## Target

Add a `:active` rule to each of the six controls below. Each gets the same treatment: a subtle scale-down, with `transform` added to the element's existing `transition` property list at the audit's press-feedback timing.

The press timing is `transform 160ms ease-out`. The repo's `--em-fast` is 120ms and `--em-med` is 200ms, so neither token matches. Rather than introduce a third duration token for a single use, use the repo's existing curve at the audit's duration inline, matching how theme.css:2278 and theme.css:2291 already hand-type a duration alongside `var(--em-ease)`:

```css
transform 160ms var(--em-ease)
```

For each of the six selectors, the target is:

```css
.em-floatbar-compose:active {
  transform: scale(0.97);
}

.em-star-btn:active {
  transform: scale(0.94);
}

.em-nav-item:active {
  transform: scale(0.99);
}

.em-swatch:active {
  transform: scale(0.94);
}

.em-rule-toggle:active {
  transform: scale(0.97);
}

.em-segment-btn:active {
  transform: scale(0.97);
}
```

Scale values are deliberately not uniform. Perceived press depth scales inversely with element size: a 30px swatch needs a deeper scale than a full-width nav row to read as the same amount of push. `.em-star-btn` and `.em-swatch` are small icon-sized targets and get 0.94. `.em-nav-item` is a wide full-bleed row where 0.97 would read as the whole sidebar lurching, so it gets 0.99. The rest get the audit's default 0.97.

Each of these selectors must also have `transform` added to its existing `transition` list so the press animates rather than snapping. Preserve every property already in each list and append:

```css
transform 160ms var(--em-ease)
```

`.em-swatch` (theme.css:3661) already has `transform var(--em-fast)` in its list. Change that entry to `transform 160ms var(--em-ease)` rather than adding a duplicate `transform` entry. A duplicate would silently win by source order and make the hover scale 160ms too, which is acceptable, but an explicit single entry is correct and avoids the confusion.

## Repo conventions to follow

- Motion tokens live in `client/src/theme.css` `:root` (theme.css:21-23): `--em-ease: cubic-bezier(0.32, 0.72, 0, 1)`, `--em-fast: 120ms var(--em-ease)`, `--em-med: 200ms var(--em-ease)`.
- Exemplar of an inline duration paired with the shared curve, which is what this plan does: `animation: em-scrim-in 140ms var(--em-ease);` at theme.css:2278.
- Exemplar of a multi-property transition list to imitate in shape: theme.css:3661-3663.
- Place each new `:active` rule immediately after the matching `:hover` rule for that selector, so related states stay adjacent.

## Steps

1. In `client/src/theme.css`, find `.em-floatbar-compose` (near line 729). Append `, transform 160ms var(--em-ease)` to its `transition` list, converting the single-line `transition: background var(--em-fast);` into a multi-line list matching the style at theme.css:3661. Add `.em-floatbar-compose:active { transform: scale(0.97); }` after its `:hover` rule.
2. Find `.em-star-btn` (near line 1454). Append `transform 160ms var(--em-ease)` to its existing `transition` list. Add `.em-star-btn:active { transform: scale(0.94); }` after its `:hover` rule.
3. Find `.em-nav-item` (near line 3595). Append `transform 160ms var(--em-ease)` to its existing `transition` list. Add `.em-nav-item:active { transform: scale(0.99); }` after its `:hover` rule.
4. Find `.em-swatch` (near line 3661). Change its existing `transform var(--em-fast)` transition entry to `transform 160ms var(--em-ease)`. Add `.em-swatch:active { transform: scale(0.94); }` after the `.em-swatch:hover` rule at theme.css:3666.
5. Find `.em-rule-toggle` (near line 3695). Append `transform 160ms var(--em-ease)` to its existing `transition` list. Add `.em-rule-toggle:active { transform: scale(0.97); }` after its `:hover` rule.
6. Find `.em-segment-btn` (near line 4047). Append `transform 160ms var(--em-ease)` to its existing `transition` list. Add `.em-segment-btn:active { transform: scale(0.97); }` after its `:hover` rule.

## Boundaries

- Do NOT add `:active` to Kumo components (`@cloudflare/kumo` `<Button>`, `<Dialog>`, etc). They ship their own press states and are out of scope. This plan covers only the six `.em-*` selectors listed.
- Do NOT touch any `.js` or `.jsx` file. This is a CSS-only change.
- Do NOT change any `:hover` rule's existing values.
- Do NOT change `.em-swatch:hover { transform: scale(1.06); }`. Plan 005 handles that rule separately. If plan 005 has already run and that hover rule now sits inside an `@media (hover: hover) and (pointer: fine)` block, leave it there and still add the `:active` rule OUTSIDE that block, at the top level. Press feedback must work on touch.
- Do NOT introduce a `--em-press` token or any new token.
- Do NOT add code comments. This repo forbids them.
- Do NOT add dependencies.
- If a selector's existing `transition` list already contains a `transform` entry other than `.em-swatch`'s, STOP and report. The code has drifted from commit 5d06e6f.

## Verification

- **Mechanical**: run `bun run lint`. Expect a pass. (The `lint` script targets `src`, not `client/src`, so it will not cover this file; passing is necessary but not sufficient.)
- **Feel check**: run `bun run dev:client`. Press and hold each of the six controls with the mouse.
  - Each must visibly compress on mouse-down and spring back on mouse-up. The compression must be perceptible but must not read as a bounce or a jump.
  - `.em-nav-item`: hold a sidebar folder and confirm the row compresses subtly. If the whole sidebar appears to lurch or the text visibly reflows, the scale is too deep. Report rather than adjusting.
  - `.em-swatch`: hold a swatch in the folder color picker and confirm it presses in. Confirm it still scales UP on hover, and that hover and press do not fight each other.
  - In DevTools Animations panel at 10% playback, confirm the press animates over roughly 160ms and does not snap instantly.
  - Open DevTools Rendering panel, enable `prefers-reduced-motion: reduce`, and press each control again. The global block at theme.css:4107 will collapse the press to 0.01ms, so the scale will snap rather than animate. This is expected and acceptable for this plan. Do NOT try to fix it here.
- **Done when**: all six controls give a visible press response on mouse-down, `grep -c ":active" client/src/theme.css` returns `6`, and no `:hover` rule's behavior has changed.
