# Animation plans

Audit run against commit `5d06e6f`. Seven plans, from an eight-category motion audit of `client/src/theme.css` (the app's entire motion surface) plus the components that drive it.

## Plans

| # | Title | Severity | Category | Files | Status |
| --- | --- | --- | --- | --- | --- |
| [001](001-fix-undobar-transform-clobber.md) | Fix the undo bar's off-center slide-in | HIGH | Physicality | `theme.css` | DONE |
| [002](002-add-press-feedback.md) | Add press feedback to custom pressable controls | HIGH | Physicality | `theme.css` | DONE |
| [003](003-delete-dead-motion-code.md) | Delete the dead motion code | MEDIUM | Cohesion | `theme.css`, `store.js` | DONE |
| [004](004-make-toggles-interruptible.md) | Convert the shortcuts overlay and sidebar scrim from keyframes to transitions | MEDIUM | Interruptibility | `theme.css`, `Shortcuts.jsx`, `AppShell.jsx` | DONE |
| [005](005-gate-swatch-hover-for-touch.md) | Gate the swatch hover scale behind a real-hover query | MEDIUM | Accessibility | `theme.css` | DONE |
| [006](006-reveal-label-edit-on-focus.md) | Reveal the label edit button on keyboard focus | MEDIUM | Accessibility | `theme.css` | DONE |
| [007](007-fix-jk-cursor-index-space.md) | Fix j/k walking the wrong index space | HIGH | Behavior | `AppShell.jsx`, `MessageList.jsx` | DONE |

## Execution order

Six of the seven plans edit `client/src/theme.css`, and two edit `AppShell.jsx`. **Do not run these in parallel.** Run in three sequential batches:

**Batch 1** — `theme.css` and `store.js`: 001, 002, 003, 005, 006, in that order.
**Batch 2** — after batch 1: 004.
**Batch 3** — after batch 2: 007.

## Dependencies

- **004 must run after 003.** 003 establishes which keyframes are live. 004 then orphans `em-fade` and `em-pop` and deletes them. Running 004 first would leave 003 with a stale picture of what is referenced.
- **002 and 005 both touch `.em-swatch`** (theme.css:3661-3668). 002 adds `.em-swatch:active` and rewrites its `transition` entry; 005 wraps `.em-swatch:hover` in a media query. Order between them does not matter, but they must not run concurrently, and 005 explicitly requires the `:active` rule to stay **outside** its media query.
- **004 and 007 both touch `AppShell.jsx`** in different places (004 at lines 392 and 476; 007 at lines 77, 185, 235-250, 436). Sequential only.
- **007 is independent of all the CSS plans** and could run first if preferred. It is last here only because it is the largest.

## Correction: plan 007 was only half the story

007 blames the j/k finickiness on the cursor indexing the flat message array while the list renders threads. That bug was real and the fix stands, but it was **not** what made j/k feel broken.

The actual cause was an unguarded async race in `openMessage` (`store.js`): every `j` fired `api.thread(...)` with nothing checking that the response still matched the open thread, so a slow fetch for a thread you had already moved past would land later and flip the reader back to it. Whichever response happened to return last won. Fixed in `23d85f7` with a `threadSeq` guard, mirroring the `reqSeq` idiom `loadList` already used.

Sequence of wrong diagnoses, for the record: a 120ms CSS fade (finding 9, wrong), then the index space (real, but not what was felt), then the race (the actual cause).

## Notes on what was deliberately not planned

- **The floatbar bounce** (`theme.css:669`, `cubic-bezier(0.34, 1.56, 0.64, 1)` at `0.46s`) was raised as a cohesion finding and **rejected by the author**. It is the app's only bounce and is off-token, but nothing waits on it and it is never re-triggered rapidly, so the frequency argument against it does not hold. It stays. Do not "fix" it.
- **The global reduced-motion block** (`theme.css:4107`) nukes opacity-only motion along with movement, which freezes the skeleton pulse (`theme.css:3399`) and hard-cuts scrims. Real but judged minor by the author. Not planned.
- **The touch case for `.em-label-edit`** (invisible pencil button on phones) is out of scope for 006, which fixes only the keyboard case. It needs a product decision. See 006's Scope note.
- **The undo bar's missing exit animation** is deliberately deferred out of 004. See 004's Boundaries.
- **The `useEffect` with no dependency array** at `AppShell.jsx:195` is churn, not a bug, and 007 depends on its closure-refreshing behavior. See 007's Boundaries.

## Missed opportunities (not planned, raised for a decision)

- Expanding a message in a thread teleports (`ThreadView.jsx:412` mounts `.em-msg-body` bare), jumping every message below it plus the reply composer. The honest fix is a height animation, which conflicts with the transform/opacity-only performance rule.
- Modals animate in and vanish in one frame (`em-panel-in`, `theme.css:2291`, has no exit path).
- The delight budget is allocated backwards: the bounciest motion in the app is on the always-visible floatbar, while first-run moments (BYOD domain verified, first folder created) are silent.
