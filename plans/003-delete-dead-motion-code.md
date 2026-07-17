# 003 — Delete the dead motion code

- **Status**: DONE
- **Commit**: 5d06e6f
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens
- **Estimated scope**: 2 files, ~45 lines removed

## Problem

Four blocks of motion code cannot run. They are not merely unused: they read as an intentional, half-finished pane and message entrance system, which makes them a trap. The next person to touch this file will reasonably try to "finish" them, and finishing them would be a regression. See the "Why delete rather than wire up" section below, and read it before starting.

**1. `.em-pane-reader` sets `animation-name` with no duration.**

```css
/* client/src/theme.css:474 */
.em-pane-reader {
  animation-name: em-pane-in-reader;
}

@keyframes em-pane-in-reader {
  from {
    opacity: 0;
    transform: translateX(14px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

`.em-pane` (theme.css:455) declares only `display`, `flex-direction`, `height`, `min-height`, and `width`. No rule anywhere supplies an `animation-duration` for these elements, and `animation-duration` defaults to `0s`. The animation never renders a single frame. The class is live (`ThreadView.jsx:1015`, `:1027`, `:1128` render `<div className="em-pane em-pane-reader">`), but its animation is inert.

**2. `@keyframes em-pane-in` is referenced by nothing.**

```css
/* client/src/theme.css:463 */
@keyframes em-pane-in {
  from {
    opacity: 0;
    transform: translateX(8px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

A repo-wide grep for `em-pane-in` matches only this definition and the separate `em-pane-in-reader` identifier. No `animation` or `animation-name` declaration names it.

**3. `@keyframes em-msg-reveal` is referenced by nothing.**

```css
/* client/src/theme.css:1217 */
@keyframes em-msg-reveal {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Every `animation`/`animation-name` declaration in theme.css sits at lines 429, 433, 437, 475, 2278, 2291, 3313, 3333, 3399, 3791, and 4003. None names `em-msg-reveal`.

**4. The entire view-transition system is wired to a stub.**

```js
/* client/src/store.js:6 */
function runViewTransition(apply) {
  apply();
}
```

It never calls `document.startViewTransition`. A repo-wide grep for `startViewTransition` returns zero hits. Because no view transition is ever started, the `::view-transition-old`/`::view-transition-new` pseudo-elements are never created, so this block is unreachable:

```css
/* client/src/theme.css:423 */
  view-transition-name: em-column;
}

@media (prefers-reduced-motion: no-preference) {
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none;
  }

  ::view-transition-old(em-column) {
    animation: em-vt-out 180ms var(--em-ease) both;
  }

  ::view-transition-new(em-column) {
    animation: em-vt-in 260ms var(--em-ease) both;
  }
}

@keyframes em-vt-out {
  ...
}

@keyframes em-vt-in {
  ...
}
```

This block also ships an inverted accessibility gate. The `animation: none` on `::view-transition-old/new(root)`, which is the author's deliberate suppression of the browser's default full-page crossfade, sits INSIDE the `prefers-reduced-motion: no-preference` block. Under `prefers-reduced-motion: reduce` the whole block drops out, so reduced-motion users would get the browser's default crossfade back. They would receive MORE animation than everyone else. The global safety net at theme.css:4107 cannot rescue this, because `::view-transition-*` pseudo-elements live in a separate tree rooted at `::view-transition` and are not matched by `*`, `*::before`, or `*::after`.

## Why delete rather than wire up

Do not "fix" these by supplying the missing duration or by implementing `startViewTransition`. That would be a regression, for a specific reason:

`runViewTransition` is called from `openMessage` (store.js:281) and `closeMessage` (store.js:331). `openMessage` is the thread-open path, and `j`, `k`, and `Enter` all route into it via `openByIndex` (AppShell.jsx:238, :246, :253). Thread open is a 100+ times/day keyboard action, and the rule for that frequency band is categorical: no animation, ever. Wiring up the view transition would fire a 260ms enter animation on every `j` keypress.

The same reasoning applies to `em-msg-reveal`, whose name places it on message rows, the same 100+/day surface.

The current runtime behavior, an instant cut, is already correct. It was arrived at by accident and it is being protected by the fact that the code is broken. Deleting the dead code makes the correct behavior intentional.

## Target

All four blocks removed. Runtime behavior after this change is byte-for-byte identical to before, because none of the removed code ever executed. This is a pure deletion with no observable effect.

`client/src/store.js` keeps its `openMessage` and `closeMessage` logic exactly as-is, with the `runViewTransition` indirection removed and its callback body inlined.

## Repo conventions to follow

- `client/src/theme.css` groups a selector with its related `@keyframes` immediately after it. Preserve the blank-line rhythm between top-level blocks when removing.
- `client/src/store.js` uses `useCallback` for exported store actions. Do not change that shape.

## Steps

1. In `client/src/theme.css`, delete the line `view-transition-name: em-column;` from the `.em-column` rule (line 423). Keep every other declaration in that rule: `flex`, `width`, `max-width`, `min-width`, `height`, `display`, `flex-direction`, `position`.
2. In `client/src/theme.css`, delete the entire `@media (prefers-reduced-motion: no-preference) { ... }` block that starts at line 426 and contains the three `::view-transition-*` rules.
3. In `client/src/theme.css`, delete `@keyframes em-vt-out` (starts line 441) and `@keyframes em-vt-in` (starts line 448) in full.
4. In `client/src/theme.css`, delete `@keyframes em-pane-in` (starts line 463) in full.
5. In `client/src/theme.css`, delete the `.em-pane-reader { animation-name: em-pane-in-reader; }` rule (line 474) and `@keyframes em-pane-in-reader` (starts line 478) in full.
6. In `client/src/theme.css`, delete `@keyframes em-msg-reveal` (starts line 1217) in full.
7. In `client/src/store.js`, delete the `runViewTransition` function (lines 6-8).
8. In `client/src/store.js` at what is currently line 281, replace `runViewTransition(() => {` ... `});` with the callback's body inlined directly into `openMessage`, removing one level of indentation from the body. The statements and their order must be unchanged.
9. In `client/src/store.js` at what is currently line 331, do the same for `closeMessage`. Its body is `setOpenId(null); setThread(null);`, which becomes two plain statements.

## Boundaries

- Do NOT keep `.em-pane-reader` as an empty rule. Remove the selector entirely.
- Do NOT remove the `em-pane-reader` or `em-pane` **class names** from `ThreadView.jsx`. `.em-pane` is a live layout rule (theme.css:455) and `em-pane-reader` may be used as a JS or test selector. Only the CSS animation rule goes.
- Do NOT touch the global `@media (prefers-reduced-motion: reduce)` block at theme.css:4107. That one is live and is a separate concern.
- Do NOT touch `@keyframes em-slidein` (theme.css:627), `em-scrim-in` (2294), `em-panel-in` (2300), `em-fade` (3316), `em-pop` (3336), or `em-skel-pulse` (3430). All six are live.
- Do NOT touch the `.em-column` rule inside the `@media (max-width: ...)` block at theme.css:3450.
- Do NOT implement `document.startViewTransition`. Do NOT add an `animation-duration` to any deleted rule. Read "Why delete rather than wire up" above.
- Do NOT add code comments. This repo forbids them.
- Do NOT add dependencies.
- If any of the six keyframes named in step 3-6 turns out to have a live reference, STOP and report. The code has drifted from commit 5d06e6f.

## Verification

- **Mechanical**:
  - `bun run build` must succeed.
  - `grep -rn "em-vt-in\|em-vt-out\|em-pane-in\|em-msg-reveal\|view-transition\|runViewTransition" client/src/` must return **zero** hits.
  - `grep -rn "em-pane-reader" client/src/` must still return the three `ThreadView.jsx` hits and nothing in `theme.css`.
- **Feel check**: run `bun run dev:client`.
  - Open a thread from the message list by clicking. It must appear instantly, exactly as it did before this change. There must be no crossfade, no slide, and no flash.
  - Press `j` and `k` repeatedly. Thread switching must be instant, with no entrance animation.
  - Press Escape to close the reader. Instant, no animation.
  - Expand a collapsed message in a multi-message thread. Unchanged from before.
  - This plan must produce **no visible difference of any kind**. If you can see any change in behavior, something live was deleted. STOP and report.
- **Done when**: the greps above are clean, the build passes, and the app's motion is provably identical to before the change.
