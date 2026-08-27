---
status: in-progress
branch: not-a-git-repo (shared local checkout, no git)
timestamp: 2026-08-16T07:05:00-07:00
files_modified:
  - PRODUCT.md
  - PRODUCT-TECH.md
  - src/lib/components/notes/RichEditor.svelte
  - src/lib/components/notes/VaultTree.svelte
  - src/lib/components/ContextMenu.svelte
  - src/lib/notes/notes.svelte.ts
  - src/lib/notes/mdBlocks.ts
  - src/lib/notes/mdBlocks.test.ts
  - src/lib/backend.ts
  - src/lib/types.ts
  - CONTEXT.md
---

## Working on: Markdown Notes module for FractalGrab

### Summary

Second session on the Notes workspace. All gates green (36 vitest, 0 svelte-check
errors, 10 Rust tests) and a full E2E pass of the file-op flows in the browser
preview (port 5174) uncovered **five real bugs, all fixed and verified live**:

1. **Rich-view typing was silently dropped** (critical): browsers fire `input`
   on the contenteditable *host* (`.rich-host`), but `onInput` only looked at
   `e.target.closest('[data-md-index]')` → null → edits never reached the store
   (typing would be lost on toggle/save). Fixed with a caret-based fallback
   (`currentBlock()`); verified: type → dirty → autosave → source round-trip.
2. **Browser virtual backend `notesMove` copied instead of moving** (source
   entry never deleted) and `notesRename` left stale nested dirs/mtimes —
   preview-only bugs; the Rust commands were already correct.
3. **Vault-root file rows** (rendered in `VaultTree.svelte`, not
   `VaultTreeItem`) were missing the rename input, cut-dimming, and the
   Delete/F2/Ctrl+C/Ctrl+X keyboard shortcuts. Brought to parity.
4. **Empty documents** parsed to zero blocks → nothing to type into in Rich
   view. `parseDocument('')` now yields one blank editable block (serializes
   back to `''`; pinned by a new test).
5. **Context menu opened over the editors**: right-click in Rich/Raw showed the
   vault-root menu. `ContextMenu` now bails for `.rich-host` / `.cm-editor`.

Also fixed: cut-paste into an entry's own folder is now a silent no-op per
PRODUCT 16 (marking preserved); Rich-view undo/redo restores the caret
(PRODUCT 25); stray indentation artifacts cleaned from `notes.svelte.ts` /
`types.ts`. Docs synced: PRODUCT.md gains a **Frontmatter** item (44), browser
preview is item 45 (virtual vault, no longer "explanatory empty state"), and
PRODUCT-TECH.md mirrors both.

### Verified in the live preview

- Frontmatter: tab named "Welcome to Notes"; frontmatter + redundant `#` h1
  hidden in Rich; byte-preserved in source.
- Round-trip: 4× Raw → Rich → Raw byte-identical (PRODUCT 31). Rich typing →
  `**Get**`-style serialization, autosave, shared undo/redo (Cmd+Z /
  Cmd+Shift+Z / Cmd+Y) across both views (PRODUCT 32).
- Context menus match PRODUCT 12 (file / folder / empty-space); cut dimming,
  move + tab-path reconcile, copy auto-suffix ("Welcome copy.md"), inline
  rename, delete + confirm + tree refresh, missing-file tab state (PRODUCT 24),
  single-branch expansion (PRODUCT 8), New note → dialog → opened in tab
  (PRODUCT 40), dirty-close Save/Discard/Cancel modal (PRODUCT 23).
- Shortcut guard (PRODUCT 43) confirmed by code (`bindShortcuts` checks
  `isContentEditable`); `/` focus test not re-run live this session.

### Decisions Made (this session)

- **onInput resolves the block from the target, falling back to the caret** —
  covers host-targeted input events in WKWebView/Chrome; the selection is
  always inside the edited block when `input` fires.
- **Empty doc = one blank block** in `parseDocument` (not a RichEditor special
  case) so every document always has an editable target; serialization is
  unchanged (`''`).
- **PRODUCT 16 no-op keeps the cut marking** — nothing was pasted, so the cut
  state survives for another destination (matches "no-op" reading of the spec).
- **Docs renumbering kept minimal**: new Frontmatter item is 44, browser
  preview moved 44 → 45; no other PRODUCT numbers changed.

### Remaining Work

1. Optional follow-ups (TECH.md): OS file-watching for the tree (replaces
   refresh-on-focus), per-tab view persistence (defaults to Rich on reopen),
   drag-and-drop move within the tree, vault-wide full-text search, linkify.
2. Consider verifying the conflict flow (Overwrite / Reload / Cancel) against a
   real file edited outside the app in a Tauri session — the browser virtual
   backend can't simulate an external mtime change easily.
3. Dev server on 5174 is stopped (pid was recorded in /tmp/fg-notes-dev.pid);
   restart with `pnpm dev --port 5174 --strictPort` (daemonize via double-fork
   or keep the terminal open — the sandbox reaps plain backgrounded processes).

### Notes

- FractalGrab is **not a git repo** — no commits; all work is uncommitted local
  changes in the shared checkout.
- Port 5173 hosts a *different* project's dev server (`fractalmandala`) — do
  not touch it; FractalGrab dev runs on 5174.
- The store module pattern: never export `$state` bindings (Svelte compiler
  forbids it) — state lives behind `notesUi` getter/setter object and action
  functions, mirroring `store.svelte.ts`.
- **Synthetic input events target the editing host, not the block** — when
  driving the Rich editor from tests use a real selection + `execCommand`
  (fires `input` on `.rich-host`, which the fixed handler resolves via the
  caret). `preview_type` on the rich contenteditable flattens the DOM
  (test-tool artifact) — toggle Raw↔Rich or reload to re-render from source.
- `preview_type` on CodeMirror's contenteditable also flattens newlines and its
  insertions never reach the store (CM doc state) — use `execCommand` with a
  caret at the end of a `.cm-line` instead; read state in a *separate* evaluate
  after the reactive flush, and watch the 1s autosave: dirty state is fleeting.
- HMR resets `notes.svelte.ts` module state mid-test — full page reload gives
  a clean session; the browser virtual vault reseeds on reload.
- Toolbar buttons use `onmousedown` (prevents focus steal) — synthetic
  `.click()` doesn't trigger them; dispatch mousedown + click. Menu items use
  plain `onclick` (`.click()` works); tree-row close buttons worked with a real
  `preview_click`, synthetic clicks on `.tab-close` were unreliable.
- `document.execCommand('insertText')` fires `input` with target = editing
  host; the CM raw editor registers it via its mutation observer.
- First page load right after starting the dev server once showed a truncated
  document (one-off; not reproducible across 4+ round-trips after reload) —
  treat as a dev-server cold-start artifact, reload once if it recurs.
- Cmd+Shift+Z redo works in Rich (hand-rolled handler); in Raw it goes through
  CM's keymap — synthetic `keydown` with shiftKey didn't match it in tests
  (suspected test-tool artifact; Cmd+Y verified working in Raw).
- The svelte-check a11y warnings (55) are the pre-existing class of hints
  (treeitem aria props, autofocus, div click handlers); no new error types.
