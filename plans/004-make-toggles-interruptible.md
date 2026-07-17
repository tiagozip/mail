# 004 — Convert the shortcuts overlay and sidebar scrim from keyframes to transitions

- **Status**: DONE
- **Commit**: 5d06e6f
- **Severity**: MEDIUM
- **Category**: Interruptibility
- **Estimated scope**: 3 files, ~50 lines

## Problem

CSS transitions retarget from the current state when interrupted. CSS keyframes restart from zero. Two reversible, rapidly-triggerable surfaces here use keyframes, and both are also conditionally mounted, so neither can animate its exit at all: they animate in over 120-200ms and then vanish in a single frame.

**1. The shortcuts overlay is a keyboard toggle driven by keyframes.**

```css
/* client/src/theme.css:3313 */
  animation: em-fade var(--em-fast);
```

```css
/* client/src/theme.css:3333 */
  animation: em-pop var(--em-med);
```

`Shortcuts.jsx:17-19` renders `<div className="em-kbd-overlay">` wrapping `<div className="em-kbd-card">`. It is conditionally mounted at `AppShell.jsx:476` and toggled by a bare keypress at `AppShell.jsx:207`:

```js
if (e.key === "?") {
  setShowHelp((s) => !s);
  return;
}
```

This is literally a toggle, bound to a single key, in a keyboard-heavy app. Mashing `?` replays the 200ms pop from `scale(0.97)` every time instead of retargeting from wherever the card currently is. And the timing is asymmetric in the wrong direction: the entry is the slow part and there is no exit at all.

**2. The mobile sidebar's two halves use incompatible mechanisms for one gesture.**

```css
/* client/src/theme.css:3776 — the panel: a transition, correctly retargets */
    transform: translateX(-105%);
    transition: transform var(--em-med);
  }
  .em-sidebar-wrap.is-open {
    transform: translateX(0);
```

```css
/* client/src/theme.css:3785 — the scrim: a keyframe, cannot reverse */
  .em-sidebar-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 110;
    background: rgba(0, 0, 0, 0.5);
    animation: em-fade var(--em-fast);
  }
```

`AppShell.jsx:392-393`:

```jsx
{sidebarOpen && <div className="em-sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
<div className={`em-sidebar-wrap${sidebarOpen ? " is-open" : ""}`}>
```

The wrap stays mounted and is class-toggled, so closing it mid-open smoothly reverses from its current X. The scrim is conditionally mounted with a keyframe, so it can only hard-cut in and hard-cut out. Its 120ms fade-in also fights the panel's 200ms slide. Tapping the scrim while the panel is still sliding in is easy to hit on touch, and it is exactly the reversible-mid-motion case the rule names.

## Target

Both surfaces stay mounted and are driven by class-toggled transitions on `opacity` and `transform` only.

**Shortcuts overlay** (`client/src/theme.css`, replacing the `animation:` lines at 3313 and 3333):

```css
.em-kbd-overlay {
  opacity: 0;
  visibility: hidden;
  transition:
    opacity var(--em-fast),
    visibility 0s linear 120ms;
}

.em-kbd-overlay.is-open {
  opacity: 1;
  visibility: visible;
  transition:
    opacity var(--em-fast),
    visibility 0s linear 0s;
}

.em-kbd-card {
  opacity: 0;
  transform: scale(0.97) translateY(6px);
  transition:
    opacity var(--em-med),
    transform var(--em-med);
}

.em-kbd-overlay.is-open .em-kbd-card {
  opacity: 1;
  transform: scale(1) translateY(0);
}
```

The `visibility` entries are load-bearing, not decoration. The overlay is `position: fixed; inset: 0`, so once it is always mounted it would swallow every click on the app underneath and expose its buttons to the Tab order. `visibility: hidden` removes it from hit-testing and from the accessibility tree, and the `0s linear 120ms` delay holds visibility on until the opacity fade-out has finished. On open, the delay is `0s` so it becomes visible immediately. Do not replace `visibility` with `pointer-events: none`, which fixes clicks but not the Tab order.

The card's entry values (`scale(0.97) translateY(6px)` over `--em-med`) are carried over verbatim from the existing `em-pop` keyframe. This plan changes the mechanism, not the look.

**Sidebar scrim** (`client/src/theme.css`, inside the existing `@media (max-width: 820px)` block, replacing the rule at 3785):

```css
  .em-sidebar-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 110;
    background: rgba(0, 0, 0, 0.5);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--em-med);
  }
  .em-sidebar-scrim.is-open {
    opacity: 1;
    pointer-events: auto;
  }
```

The scrim's duration moves from `--em-fast` (120ms) to `--em-med` (200ms) to match `.em-sidebar-wrap`'s existing `transition: transform var(--em-med)`. The two halves of one gesture must share a duration. `pointer-events` rather than `visibility` here because the scrim has no focusable children, and it must not intercept taps when closed.

The top-level `.em-sidebar-scrim { display: none; }` at theme.css:3755 stays exactly as-is. Desktop never shows the scrim, and that rule is what keeps it out of the way.

**JSX**: both elements render unconditionally with a class toggle, matching how `.em-sidebar-wrap` already works at `AppShell.jsx:393`.

## Repo conventions to follow

- The `is-open` / `is-hidden` / `is-active` class-toggle pattern is this repo's established way of driving a transition from React state. Exemplar: `AppShell.jsx:393`, `<div className={`em-sidebar-wrap${sidebarOpen ? " is-open" : ""}`}>` paired with `.em-sidebar-wrap.is-open` at theme.css:3780. Imitate this exactly.
- A second exemplar of the same pattern: `MessageList.jsx:396`, `<div className={`em-floatbar${floatHidden ? " is-hidden" : ""}`}>`.
- Motion tokens live in `client/src/theme.css` `:root` (theme.css:21-23): `--em-ease: cubic-bezier(0.32, 0.72, 0, 1)`, `--em-fast: 120ms var(--em-ease)`, `--em-med: 200ms var(--em-ease)`.

## Steps

1. In `client/src/components/Shortcuts.jsx`, change the component signature from `export function Shortcuts({ onClose })` to `export function Shortcuts({ open, onClose })`.
2. In the same file, change the root element from `<div className="em-kbd-overlay" onClick={onClose}>` to `<div className={`em-kbd-overlay${open ? " is-open" : ""}`} onClick={onClose}>`. Change nothing else in this file.
3. In `client/src/components/AppShell.jsx` at line 476, change the conditional mount `{showHelp && <Shortcuts onClose={() => setShowHelp(false)} />}` to an unconditional render passing the state as a prop: `<Shortcuts open={showHelp} onClose={() => setShowHelp(false)} />`. Preserve the existing `onClose` handler exactly.
4. In `client/src/components/AppShell.jsx` at line 392, change `{sidebarOpen && <div className="em-sidebar-scrim" onClick={() => setSidebarOpen(false)} />}` to an unconditional render with a class toggle: `<div className={`em-sidebar-scrim${sidebarOpen ? " is-open" : ""}`} onClick={() => setSidebarOpen(false)} />`. Preserve the existing `onClick` handler exactly.
5. In `client/src/theme.css`, in the `.em-kbd-overlay` rule (near line 3313), delete `animation: em-fade var(--em-fast);` and add the `opacity`, `visibility`, and `transition` declarations from the Target section. Keep every other declaration in that rule, including `backdrop-filter: blur(3px)`, `display: flex`, `align-items`, `justify-content`, and `padding`.
6. In `client/src/theme.css`, add the `.em-kbd-overlay.is-open` rule from the Target section immediately after the `.em-kbd-overlay` rule.
7. In `client/src/theme.css`, in the `.em-kbd-card` rule (near line 3333), delete `animation: em-pop var(--em-med);` and add the `opacity`, `transform`, and `transition` declarations from the Target section. Keep every other declaration, including `background`, `border`, `border-radius`, `padding`, `max-width`, `width`, and `box-shadow`.
8. In `client/src/theme.css`, add the `.em-kbd-overlay.is-open .em-kbd-card` rule from the Target section immediately after the `.em-kbd-card` rule.
9. In `client/src/theme.css`, replace the `.em-sidebar-scrim` rule inside the `@media (max-width: 820px)` block (near line 3785) with the two rules from the Target section.
10. `@keyframes em-fade` (theme.css:3316) and `@keyframes em-pop` (theme.css:3336) are now referenced by nothing. Confirm with `grep -rn "em-fade\|em-pop" client/src/` and delete both keyframe blocks in full.

## Boundaries

- Do NOT touch the undo bar (`.em-undobar`, theme.css:3987, `animation: em-slidein var(--em-med)` at 4003). It has the same missing-exit shape, but plan 001 is already editing `em-slidein` and a keep-mounted rewrite of the undo bar interacts with its `setTimeout` dismissal at `AppShell.jsx:325`. It is deliberately deferred. Leave it alone.
- Do NOT touch `.em-modal-scrim` (theme.css:2278) or `.em-modal-panel` (theme.css:2291). Those are occasional-frequency setup dialogs that are not rapid-toggled, and their keyframes are defensible.
- Do NOT touch `.em-sidebar-wrap` (theme.css:3776) or its `.is-open` rule. It is already correct.
- Do NOT touch the top-level `.em-sidebar-scrim { display: none; }` at theme.css:3755.
- Do NOT change the card's entry values. `scale(0.97)`, `translateY(6px)`, and `--em-med` are carried over verbatim from `em-pop`.
- Do NOT add `@starting-style`. The keep-mounted class toggle makes it unnecessary, and it would not give an exit animation anyway.
- Do NOT add `transition-behavior: allow-discrete` or transition `display`.
- Do NOT change the `?` key handler or any other logic in the `onKey` effect at `AppShell.jsx:195`.
- Do NOT add code comments. This repo forbids them.
- Do NOT add dependencies.
- This plan assumes plan 003 has already run. If `@keyframes em-fade` or `em-pop` has references other than the ones this plan removes, STOP and report.

## Verification

- **Mechanical**:
  - `bun run build` must succeed.
  - `grep -rn "em-fade\|em-pop" client/src/` must return zero hits.
  - `grep -rn "animation:" client/src/theme.css` must no longer list the shortcuts overlay, the card, or the sidebar scrim.
- **Feel check**: run `bun run dev:client`.
  - Press `?`. The overlay must fade in and the card must pop in, looking the same as before this change.
  - Press `?` again. The overlay must now fade **out** over 120ms and the card must scale back down, rather than vanishing in one frame. This is new behavior and is the point of the plan.
  - **Mash `?` rapidly.** The card must smoothly reverse from wherever it currently is. It must never jump back to `scale(0.97)` and restart. This is the core check.
  - With the overlay closed, click around the app normally. Nothing must be blocked. Press Tab repeatedly and confirm focus never lands on a shortcuts-overlay element. If either fails, the `visibility` handling is wrong.
  - In DevTools Animations panel at 10% playback, press `?` and confirm the fade and pop run together over 120ms/200ms with no restart.
  - Resize the window below 820px to get the mobile sidebar. Open it with the menu button, then **tap the scrim while the panel is still sliding in**. The panel and scrim must reverse together smoothly, in sync, over the same 200ms. Neither may hard-cut.
  - Enable `prefers-reduced-motion: reduce` in the DevTools Rendering panel. Both surfaces will snap instantly because of the global block at theme.css:4107. Expected. Confirm the overlay still opens and closes correctly and that the scrim still blocks and unblocks taps, i.e. `visibility` and `pointer-events` still flip.
- **Done when**: mashing `?` never restarts the card animation from zero, tapping the scrim mid-open reverses both halves in sync, the closed overlay blocks neither clicks nor Tab, and `em-fade`/`em-pop` are gone from the codebase.
