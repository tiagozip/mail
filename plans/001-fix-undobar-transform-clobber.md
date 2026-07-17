# 001 — Fix the undo bar's off-center slide-in

- **Status**: DONE
- **Commit**: 5d06e6f
- **Severity**: HIGH
- **Category**: Physicality & origin
- **Estimated scope**: 1 file, ~6 lines

## Problem

`.em-undobar` centers itself horizontally with `transform: translateX(-50%)` on its base rule, then runs an entry animation whose keyframes also set `transform`. CSS `transform` is a single property, so the keyframe's value **replaces** the base rule's centering for the whole duration of the animation.

Current base rule:

```css
/* client/src/theme.css:3987 */
.em-undobar {
  position: fixed;
  bottom: 92px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 220;
  display: flex;
  align-items: center;
  gap: var(--em-4);
  height: 48px;
  padding: 0 var(--em-3) 0 var(--em-5);
  border-radius: 999px;
  border: 1px solid var(--color-kumo-line);
  background: color-mix(in srgb, var(--color-kumo-canvas) 88%, transparent);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  animation: em-slidein var(--em-med);
}
```

Current keyframes:

```css
/* client/src/theme.css:627 */
@keyframes em-slidein {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Result: for the 200ms the animation runs, the bar has no `translateX(-50%)`, so `left: 50%` positions its **left edge** at the horizontal midpoint. The bar sits displaced to the right by half its own width (roughly 90px). When the animation ends there is no `forwards`/`both` fill, so the base rule's `transform` resumes and the bar hard-snaps back to centered in a single frame.

This is the "Message sent / Undo" bar, rendered at `client/src/components/AppShell.jsx:468`:

```jsx
{undoBar && (
  <div className="em-undobar">
    <span className="em-undobar-text">Message sent</span>
    <button type="button" className="em-undobar-btn" onClick={undoSend}>
```

It fires on every send. This is the single confirmation the user is looking at after the action, and it currently arrives sideways and jerks into place.

`em-slidein` is used by exactly one selector. A repo-wide grep for `em-slidein` returns only its `@keyframes` definition (theme.css:627) and this one `animation:` reference (theme.css:4003). It is therefore safe to change the keyframe itself rather than introducing a new one.

## Target

Bake the centering translate into every keyframe step so the composed transform is correct at all times:

```css
@keyframes em-slidein {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-3px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
```

The base rule at theme.css:3987 stays exactly as it is. Do not change its `transform`, `left`, `bottom`, or `animation` declarations.

Expected end state: the bar fades in over 200ms while sliding down 3px, horizontally centered for every frame, and holds centered when the animation completes.

## Repo conventions to follow

- Motion tokens live in `client/src/theme.css` `:root` (theme.css:21-23): `--em-ease: cubic-bezier(0.32, 0.72, 0, 1)`, `--em-fast: 120ms var(--em-ease)`, `--em-med: 200ms var(--em-ease)`. This plan does not add or change any token.
- Exemplar of a keyframe that correctly composes a full transform string: `@keyframes em-pop` at theme.css:3336, which sets `transform: scale(0.97) translateY(6px)` in one declaration rather than relying on a base rule to contribute part of it.

## Steps

1. In `client/src/theme.css`, locate `@keyframes em-slidein` at line 627.
2. In its `from` block, change `transform: translateY(-3px);` to `transform: translateX(-50%) translateY(-3px);`.
3. In its `to` block, change `transform: translateY(0);` to `transform: translateX(-50%) translateY(0);`.
4. Change nothing else.

## Boundaries

- Do NOT touch `.em-undobar` (theme.css:3987) or any other rule.
- Do NOT touch `client/src/components/AppShell.jsx`.
- Do NOT add `forwards` or `both` to the `animation` shorthand. With the transform composed correctly, the base rule already provides the correct resting state and a fill mode is unnecessary.
- Do NOT rename the keyframe or create a second one.
- Do NOT add code comments. This repo forbids them.
- Do NOT add dependencies.
- If `@keyframes em-slidein` has more than two steps or a different transform than shown above, STOP and report. The code has drifted from commit 5d06e6f.

## Verification

- **Mechanical**: run `bun run lint` from the repo root. Expect it to pass with no new findings. (Note: the `lint` script targets `src`, not `client/src`, so it will not actually cover this file. Passing lint is necessary but not sufficient here; the feel check is what matters.)
- **Feel check**: run `bun run dev:client`, send a message, and watch the undo bar appear.
  - The bar must be horizontally centered on the very first frame it is visible, not offset to the right.
  - There must be no sideways jump at the moment the animation finishes.
  - Open DevTools, go to the Animations panel, set playback speed to 10%, and send again. Through the whole slow-motion playback the bar's horizontal center must stay locked to the viewport's center. Only vertical position and opacity may change.
- **Done when**: at 10% playback the bar moves along a purely vertical axis, and its horizontal position never changes at any point during or after the animation.
