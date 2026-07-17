# 007 — Fix j/k walking the wrong index space

- **Status**: DONE
- **Commit**: 5d06e6f
- **Severity**: HIGH
- **Category**: Purpose & frequency (behavior, not motion)
- **Estimated scope**: 2 files, ~35 lines

## Problem

`j` and `k` index a different array than the one on screen. This is a behavior bug, not a motion bug. It is in this plan set because it is the actual cause of `j`/`k` feeling finicky, which was originally and incorrectly attributed to a CSS transition.

**The visible list is threads. The cursor walks flat messages.**

`MessageList.jsx:255` collapses the flat message array into thread rows, and the virtualizer counts those rows:

```js
const threads = useMemo(() => groupThreads(messages), [messages]);
const rowVirtualizer = useVirtualizer({
  count: threads.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 76,
  overscan: 8,
});
```

`groupThreads` (`util.js:102-116`) buckets every message by `m.threadId || m.id` and returns one entry per thread. So `threads.length <= messages.length`, and the two arrays only line up when every thread has exactly one message.

But the cursor indexes the flat array. `AppShell.jsx:185`:

```js
function openByIndex(idx) {
  const item = store.messages[idx];
  if (!item) return;
  store.openMessage(item);
}
```

And the row highlight is driven by `openId`, not by the cursor at all. `MessageList.jsx:374`:

```jsx
active={item._members?.some((m) => m.id === openId)}
```

`cursor` is declared at `AppShell.jsx:77` and is **never passed to `MessageList`**. Confirmed: `MessageList`'s signature (`MessageList.jsx:166`) has no `cursor` prop.

**The resulting failure.** If flat messages at indices 3, 4, and 5 all belong to one thread, that thread is a single visible row. Pressing `j` three times sets the cursor to 3, then 4, then 5, and each time `openMessage` opens a message whose thread is that same row, so `active` stays true on the same row. The highlight does not move. The user presses `j`, nothing happens. Presses again, nothing happens. Then on the fourth press it jumps to the next row. Each of those dead presses still fires a thread fetch and marks a message read (`store.js:278-296`).

**Two compounding defects, same handler:**

1. **The virtualizer never follows the cursor.** `grep -rn "scrollToIndex" client/src/` returns zero hits. With `overscan: 8`, moving the cursor past the visible window lands it on a row that is not rendered. The highlight is invisible and nothing appears to happen.

2. **A side effect runs inside a state updater.** `AppShell.jsx:236-240`:

   ```js
   if (e.key === "j") {
     setCursor((c) => {
       const next = Math.min(store.messages.length - 1, c + 1);
       openByIndex(next);
       return next;
     });
     return;
   }
   ```

   `openByIndex` calls `store.openMessage`, which sets state and fires fetches. Updater functions passed to `setState` must be pure. React invokes them twice under StrictMode, and may re-invoke them during concurrent rendering.

**Not a defect, checked:** history is not spammed. `pushed.current.reader` latches at `AppShell.jsx:363-366`, so only the first open pushes an entry.

## Target

`j`/`k` keep their current preview-as-you-go behavior: each press opens the message. The fix is that each press now moves **exactly one visible row**, because the cursor indexes the same `threads` array the list renders.

This requires `threads` to be computed once and shared, rather than computed privately inside `MessageList`.

**In `AppShell.jsx`:**

```js
const threads = useMemo(() => groupThreads(store.messages), [store.messages]);
```

```js
function openByIndex(idx) {
  const item = threads[idx];
  if (!item) return;
  store.openMessage(item);
}
```

`threads[idx]` is safe to pass to `openMessage`. `groupThreads` returns `{ ...rep, _members, ... }` (`util.js:122-124`), so each entry is a real message object carrying `id`, `threadId`, `isRead`, and `folder`, which is everything `openMessage` (`store.js:278`) reads.

Key handlers become pure, with the side effect outside the updater:

```js
if (e.key === "j") {
  const next = Math.min(threads.length - 1, cursor + 1);
  setCursor(next);
  openByIndex(next);
  return;
}
if (e.key === "k") {
  const next = Math.max(0, cursor - 1);
  setCursor(next);
  openByIndex(next);
  return;
}
```

Reading `cursor` directly from the closure is correct here **only because** the effect at `AppShell.jsx:195` has no dependency array and therefore rebinds on every render, keeping the closure fresh. Do not add a dependency array. See Boundaries.

**In `MessageList.jsx`:** accept `threads` and `cursor` as props, drop the internal `useMemo`, and scroll the virtualizer to follow the cursor:

```js
useEffect(() => {
  if (cursor >= 0) rowVirtualizer.scrollToIndex(cursor, { align: "auto" });
}, [cursor, rowVirtualizer]);
```

`align: "auto"` scrolls only when the row is outside the viewport, so stepping through visible rows does not yank the list.

Clicking a row must also sync the cursor, otherwise clicking row 10 and then pressing `j` jumps the user back to row 1. The row's `onOpen` reports its index up to `AppShell`.

Switching folders must reset the cursor, otherwise `j` resumes from a stale index in a different list.

## Repo conventions to follow

- `groupThreads` is exported from `client/src/util.js` and already imported into `MessageList.jsx:24` alongside `FOLDER_LABELS`, `initials`, `monoColor`, `relativeTime`, `senderLabel`. Add the same named import to `AppShell.jsx`.
- `AppShell` already derives memoized values and passes them down as props. `MessageList` already receives 7 props (`MessageList.jsx:166`); adding two more matches the existing shape.
- The virtualizer instance is `rowVirtualizer` (`MessageList.jsx:256`).
- This repo uses `const` by default, early returns, optional chaining, and **no code comments**.

## Steps

1. In `client/src/components/AppShell.jsx`, add `groupThreads` to the existing import from `../util.js`. If there is no such import, add `import { groupThreads } from "../util.js";` next to the other local imports. Ensure `useMemo` is imported from React.
2. In `AppShell.jsx`, near the `cursor` state declaration at line 77, add: `const threads = useMemo(() => groupThreads(store.messages), [store.messages]);`
3. In `AppShell.jsx`, change `openByIndex` (line 185) to read `const item = threads[idx];` instead of `const item = store.messages[idx];`. Leave the rest of the function identical.
4. In `AppShell.jsx`, replace the `j` handler (lines 235-242) and the `k` handler (lines 243-250) with the pure versions from the Target section. The side effect must be outside `setCursor`.
5. In `AppShell.jsx`, add a cursor reset when the folder or view changes: `useEffect(() => { setCursor(-1); }, [store.view]);`. Place it near the other effects. Verify the store exposes `view`; `MessageList.jsx:167-169` destructures `view` from the store, so it exists.
6. In `AppShell.jsx` at line 436, pass the two new props to `<MessageList>`: `threads={threads}` and `cursor={cursor}`, plus `onCursorChange={setCursor}`. Keep all existing props.
7. In `client/src/components/MessageList.jsx`, add `threads`, `cursor`, and `onCursorChange` to the component's destructured props at line 166.
8. In `MessageList.jsx`, delete the internal `const threads = useMemo(() => groupThreads(messages), [messages]);` at line 255. The prop now supplies it. If `groupThreads` becomes unused in this file, remove it from the import at line 24. Leave the `rowVirtualizer` definition and its `count: threads.length` unchanged, as it now reads the prop.
9. In `MessageList.jsx`, add the `scrollToIndex` effect from the Target section, placed after the `rowVirtualizer` definition.
10. In `MessageList.jsx`, in the virtual row map near line 372, make the row report its index on open. The current prop is `onOpen={item.isDraft && onOpenDraft ? onOpenDraft : openMessage}`. Read the `Row` component (starting line 42) to see how it calls `onOpen`, then wrap the handler so it calls `onCursorChange?.(v.index)` first and then delegates to exactly the same target as before, forwarding the same arguments. Do not change which function is ultimately called for drafts vs normal messages.
11. Leave `active={item._members?.some((m) => m.id === openId)}` at line 374 **unchanged**. Since `j`/`k` still open the message, `openId` tracks the cursor and the highlight follows correctly.

## Boundaries

- Do NOT change the `useEffect` at `AppShell.jsx:195` to have a dependency array. It intentionally rebinds every render, which is what keeps `cursor` and `threads` fresh in the handler's closure. Adding a dep array here risks stale closures and is a separate refactor. It is not causing the finickiness.
- Do NOT change `j`/`k` to stop opening messages. The preview-as-you-go behavior is intended. The dedicated `Enter` handler at `AppShell.jsx:252` stays exactly as-is even though it is now partly redundant.
- Do NOT touch `client/src/util.js`. `groupThreads` is correct.
- Do NOT touch `client/src/store.js` or `openMessage`.
- Do NOT change `overscan: 8`.
- Do NOT use `align: "center"` or `align: "start"` in `scrollToIndex`. It must be `"auto"`, or stepping through visible rows will yank the list on every press.
- Do NOT add throttling, debouncing, or key-repeat suppression. Out of scope.
- Do NOT touch `client/src/theme.css`. This plan is JSX-only.
- Do NOT add code comments. This repo forbids them.
- Do NOT add dependencies.
- If `MessageList` already receives a `cursor` prop, or `openByIndex` already reads `threads`, STOP and report. The code has drifted from commit 5d06e6f.

## Verification

- **Mechanical**:
  - `bun run build` must succeed.
  - `grep -n "store.messages\[" client/src/components/AppShell.jsx` must return zero hits.
  - `grep -rn "scrollToIndex" client/src/` must return exactly one hit, in `MessageList.jsx`.
  - `grep -n "groupThreads" client/src/components/MessageList.jsx` must return zero hits if the import was removed in step 8.
- **Feel check**: run `bun run dev:client`. You need an inbox containing at least one thread with **3 or more messages** for this to be a real test. A single-message-per-thread inbox will pass even with the bug present, because the two index spaces coincide there.
  - Press `j` repeatedly from the top of the list. The highlight must advance **exactly one visible row per press**, with no dead presses and no double jumps. This is the core check and the whole point of the plan.
  - Press `j` past a multi-message thread row. It must consume exactly one press, not one per message in the thread.
  - Press `k` back up. Same, one row per press, and it must land back on the same rows in reverse order.
  - Hold `j` down. The highlight must walk smoothly to the bottom and stop cleanly at the last row without overshooting or throwing.
  - Press `j` past the bottom of the visible window. **The list must scroll to follow the highlight.** The active row must never be off-screen.
  - Press `k` back up past the top of the visible window. The list must scroll up to follow.
  - Step `j` through rows that are already fully visible. The list must NOT scroll or jitter. If it re-centers on every press, `align` is wrong.
  - Click row 10 with the mouse, then press `j`. The highlight must move to row 11, **not** jump back to the top of the list. If it jumps, step 10 is wrong.
  - Switch folders in the sidebar, then press `j`. The highlight must start from the top of the new list.
  - Open the reader, press Escape, then press `j`. Confirm no crash and sensible cursor behavior.
- **Done when**: one keypress moves exactly one visible row in an inbox with multi-message threads, the list scrolls to keep the active row visible, and clicking a row then pressing `j` continues from that row.
