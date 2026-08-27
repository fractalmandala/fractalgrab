# FractalGrab — Markdown Notes Module (PRODUCT-TECH.md)

Tech spec for the Markdown Notes module. Behavior is specified in [`PRODUCT.md`](PRODUCT.md); this document plans the implementation. FractalGrab is not a git repository (no remote, no commit SHAs), so code references are plain `path:line` anchors rather than commit-pinned links.

## Context

**Stack.** Tauri v2 (Rust) + SvelteKit 5 / Svelte 5 runes, pnpm. The frontend has no markdown or editor libraries and no test framework (`package.json` deps are `@lucide/svelte`, `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `tesseract.js`).

**Backend pattern.** All file access goes through Rust `#[tauri::command]`s in [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs) invoked from the `Backend` adapter in [`src/lib/backend.ts`](src/lib/backend.ts), which has a Tauri implementation and a browser-mode mock. `AppState` (`lib.rs:20`) holds the library dir + `config.json` path; helpers `sanitize_filename` (`lib.rs:71`), `is_inside_library` (`lib.rs:95`), `read_config`/`write_config` persist app config in the OS app-config dir. Commands are registered in `invoke_handler` (`lib.rs:149`); `http_server` is already a separate module, so a `notes` module fits the pattern. The dialog plugin (`dialog:default` in `src-tauri/capabilities/default.json`) already allows `open` with filters, so a Markdown file picker needs no capability change. `Cargo.toml` already has `uuid`, `chrono`, `regex`, `base64`; it lacks a trash crate and any walk/copy helpers.

**Frontend state pattern.** [`src/lib/store.svelte.ts`](src/lib/store.svelte.ts) is one module of `$state` runes exposing state through a `ui` accessor object (module-level `export const $state` bindings are forbidden by the Svelte compiler — see `DEV.md` troubleshooting). Actions like `deleteItems`, `askInput` (`store.svelte.ts:788`), and `bindShortcuts` (`store.svelte.ts:1067`) are exported functions. Settings persist through `manifest.settings` (merged in `applyManifest`) written by `writeManifest`.

**UI shell.** The view switcher lives in the `views` array in [`src/routes/+page.svelte:66`](src/routes/+page.svelte) and the content area switches on `manifest.settings.view` (`+page.svelte:238`). The sidebar renders `<CollectionTree/>` inside a rail `<aside>`. The library context menu is a window-level listener in [`src/lib/components/ContextMenu.svelte:163`](src/lib/components/ContextMenu.svelte) that builds menus from `data-item-id` / `data-col-id` and renders `MenuState`; inline rename already exists in [`TreeItem.svelte`](src/lib/components/TreeItem.svelte). `ViewMode` is in [`src/lib/types.ts`](src/lib/types.ts).

## Proposed changes

### 1. Rust — new `notes` command module

New file `src-tauri/src/notes.rs` (registered as `mod notes;` and its commands added to `invoke_handler` at `lib.rs:149`). Commands follow the existing `Result<T, String>` style and take absolute paths (no `is_inside_library` guard — vaults are user-chosen arbitrary folders):

- **Vault registry** (persisted in `config.json` via the existing `read_config`/`write_config`): `notes_list_vaults() -> Vec<VaultMeta { id, path, name, exists }>`, `notes_add_vault(path) -> VaultMeta` (error if not a directory or already registered), `notes_remove_vault(id)`, `notes_set_active_vault(id)`. IDs come from the existing `uuid` crate.
- **Scan**: `notes_scan(path) -> VaultNode { name, dirs: Vec<VaultNode>, files: Vec<String> }` — recursive, folders first then files, alphabetical. Only `.md`/`.markdown` (case-insensitive); skip dot-entries; skip symlinks (use `DirEntry::file_type()`, which does not follow links — symlinks pointing inside the vault are also hidden, an acceptable simplification of PRODUCT 7).
- **Read/write**: `notes_read(path) -> { text, mtimeMs }` (error on unreadable or non-UTF-8, PRODUCT 38); `notes_write(path, text, expected_mtime_ms: Option<u64>) -> { conflict: bool, mtimeMs: u64 }` — when `expected_mtime_ms` is provided and differs from the current mtime, return `conflict: true` *without writing* (this is control flow, not an error); missing target file is also reported as `conflict: true`. Genuine failures (permissions, disk) are `Err`.
- **File operations** (all validate names: non-empty, no `/` `\` NUL, not `.`/`..`, no collision in the destination):
  - `notes_rename(path, new_name) -> path` (PRODUCT 13)
  - `notes_delete(path) -> ()` — OS trash via the `trash` crate (add `trash = "5"` to `Cargo.toml`); missing path → `Ok`, other failures → `Err` (PRODUCT 18)
  - `notes_copy(src, dest_dir) -> path` — recursive copy (hand-rolled `std::fs` walk, reusing the recursion shape already in `run_backup`'s `add_dir`, `lib.rs:244`), auto-suffixed name on collision (`name copy.md`, `name copy 2.md`; PRODUCT 15)
  - `notes_move(src, dest_dir) -> path` — `fs::rename`; refuse when the destination entry exists or `src` is an ancestor of `dest_dir` (PRODUCT 16–17)
  - `notes_create(dir, kind: "note"|"folder", name) -> path` — note (empty file) or folder; collision → `Err` (PRODUCT 40)

### 2. Frontend types and adapter

- [`src/lib/types.ts`](src/lib/types.ts): add `'notes'` to `ViewMode`; add `Vault`, `VaultNode`, `VaultItem { path, name, isDir }`, `NoteTab { id, path, inVault, name, source, savedSource, mtimeMs, dirty, conflict, missing, view: 'raw'|'rich' }`, `CutState { path, isDir } | null`. Extend `Settings` with `notes: { activeVaultId: string | null, openPaths: string[] }` (persisted through the manifest like `settings.view`; merged with defaults in `applyManifest` so `defaultManifest()` must add it).
- [`src/lib/backend.ts`](src/lib/backend.ts): extend the `Backend` interface + both implementations with `listVaults/addVault/removeVault/setActiveVault/scanVault/readNote/writeNote/renameNote/deleteNote/copyNote/moveNote/createNote` and `chooseMarkdownFile()` (dialog `open`, single, filters `md, markdown`). The browser implementation runs an in-memory virtual vault (a seeded `/Vault` with demo documents) so the Notes UI is exercisable without Tauri — see PRODUCT 45.

### 3. Notes store — `src/lib/notes/notes.svelte.ts`

New module following the `ui`-bridge pattern (getters/setters, never exported `$state` bindings). Owns: vault list, active vault, tree + `treeLoading`/`treeError`, tabs, active tab, expanded folder chain, cut state; plus actions `addVault/removeVault/setActiveVault/refreshTree`, `openPath/openExternal/closeTab/setView/saveTab`, file-op actions, and the autosave loop. On launch it hydrates vaults, the active vault, and open tabs from `settings.notes`.

- **Autosave** (PRODUCT 34–39): per-tab 1s debounce → `writeNote(path, source, expectedMtimeMs)`; `conflict: true` → set `tab.conflict`, stay dirty, back off (no prompt during autosave); success → clear dirty/conflict, update `mtimeMs`; `Err` → toast, stay dirty, retry on next edit. Manual Save (`Cmd/Ctrl+S` or button) flushes immediately and, when `tab.conflict`, shows a 3-way **Overwrite / Reload / Cancel** modal (small component in `NotesView`; the app already uses `confirm()` elsewhere but needs three options). Flush-on-close via Tauri `getCurrentWindow().onCloseRequested`: prevent default, flush pending saves, destroy; on flush failure, warn (PRODUCT 39).
- **Undo/redo** (PRODUCT 32): per-tab snapshot history (`src/lib/notes/history.ts`) — push the full `source` before each mutation batch (coalesced on a short timer), shared across Raw/Rich because both edit `source`; `Cmd/Ctrl+Z`, `Shift+Cmd+Z`/`Cmd+Y`; toggling and saving never push entries.
- **Tab reconciliation after file ops** (PRODUCT 19): rename/move updates any tab whose `path` equals or starts with the old path; delete marks matching tabs `missing`.

### 4. Editor architecture (the round-trip core)

Two views over one per-tab `source`; toggling re-renders (raw→rich) or serializes (rich→raw) without touching dirty state.

- **Raw view** — `RawEditor.svelte` uses **CodeMirror 6** (`codemirror` meta-package + `@codemirror/lang-markdown`): line numbers, Markdown syntax highlighting, native history, Tab indent/outdent, `keymap` for `Mod-s` wired to the notes store. Theme derives from the app's CSS custom properties (`--bg-surface`, `--text-primary`, `--border`) so it adapts to the existing palette. *Tradeoff:* ~400 KB dep and a new ecosystem vs. a hand-rolled overlay-textarea (alignment/scroll/caret bugs, high maintenance) — CodeMirror is the defensible choice for a desktop app; the zero-dep alternative is documented but not recommended.
- **Block model** — `src/lib/notes/mdBlocks.ts` splits `source` into top-level blocks, each carrying its **exact source text**: blank-line-separated paragraphs, ATX/setext headings, fenced + indented code, thematic breaks, runs of consecutive list lines, runs of contiguous blockquote lines, runs of contiguous GFM table lines, HTML blocks. Table/HTML blocks are **read-only** in rich view (`contenteditable="false"`), as are fenced/indented code blocks and a leading YAML frontmatter block — these are preserved byte-for-byte and edited in raw view, which is consistent with PRODUCT 28 (editable constructs are paragraphs, headings, bold/italic/strikethrough/code/links/lists/quotes/images) and PRODUCT 31.
- **Rich view** — `RichEditor.svelte`: a contentEditable container whose children are the rendered blocks (`markdown-it` renders each editable block; `markdown-it`'s default preset already handles strikethrough and GFM tables). Per block: a **source cache** and a **dirty flag** set on `input` within the block element. Browsers fire `input` on the contenteditable *host*, so the owning block is resolved from the event target with a caret-based fallback (`currentBlock()`). Structural edits (Enter-split, Backspace-merge, block add/remove) are handled in the keydown handler and re-serialize only the affected blocks. A `title:` in leading frontmatter names the tab, and the frontmatter block plus a redundant leading `#` heading are hidden in Rich view (PRODUCT 44).
- **Serialization** — `src/lib/notes/domToMarkdown.ts` converts an editable block's DOM back to Markdown for the constructs the editor owns: `p`, `h1–h6`, `strong/em/del/code/a`, `ul/ol/li` (nested), `blockquote`, `img` (→ `![](...)`), `br`. **Byte preservation (PRODUCT 31):** on serialize, dirty blocks go through `domToMarkdown`; untouched blocks emit their cached source verbatim. **Paste inserts plain text only** (HTML stripped on the clipboard event), so foreign markup never enters the DOM and the serializer's input stays bounded.
- **Toolbar** — `EditorToolbar.svelte`: bold, italic, strikethrough, inline code, heading levels, bullet/numbered list, blockquote, link, image. Rich-view-only; reflects state at the caret (PRODUCT 21, 29). Image insertion picks a file, copies it into the document's own folder (`notes_copy`-style with auto-suffix), inserts a relative `![]()` (PRODUCT 30); disabled with a "save the note first" hint while the tab has no saved location.

### 5. Components and shell integration

New directory `src/lib/components/notes/`: `NotesView.svelte` (tab bar + editor + conflict modal), `EditorTabs.svelte` (name, dirty dot, close, missing state; PRODUCT 21–23), `RawEditor.svelte`, `RichEditor.svelte`, `EditorToolbar.svelte`, `NotesSidebar.svelte` (vault picker + add/remove/refresh), `VaultTree.svelte` + `VaultTreeItem.svelte` (recursive, single-branch expansion per PRODUCT 8, inline rename mirroring `TreeItem`, cut dimming, delete confirm). Component-local styling goes in scoped `<style>` blocks; shared chrome classes (tab bar, tree rows, editor frame) follow the project convention and are added to `src/lib/styles/_blocks.sass`.

[`src/routes/+page.svelte`](src/routes/+page.svelte):
- `views` array (`:66`): add `{ mode: 'notes', label: 'Notes', icon: NotebookPen }`.
- Sidebar: render `<NotesSidebar/>` when `view === 'notes'`, else `<CollectionTree/>`.
- Content (`:238`): add a notes branch rendering `<NotesView/>`.
- Library-only chrome (untracked bar, batch bar, `ItemDetail`) is guarded with `view !== 'notes'`; the toolbar title shows the active vault + open document name in notes view; the view switcher stays.

**Context menu** — extend `ContextMenu.svelte`'s `onContextMenu` (`:163`) to also match `closest('[data-vault-path]')` and build vault menus (Open / Rename / Cut / Copy / Paste / New note / New folder / Delete) from a `notesMenu()` builder in the notes store; empty-tree right-click on the vault area shows the vault-root menu (Paste / New note / New folder). Positioning and rendering reuse the existing `MenuState` machinery; `data-vault-path` on tree rows distinguishes them from library `data-item-id` / `data-col-id` rows, so the two menus cannot collide.

## Testing and validation

- **Rust unit tests** (`cargo test`, in `notes.rs` against temp-dir fixtures built with `std::env::temp_dir` + a `uuid` subdir): scan shape/sorting/dotfile-exclusion/symlink-skip/non-md exclusion (PRODUCT 6–7); read UTF-8 error (PRODUCT 38); write mtime conflict (PRODUCT 36); rename collision + invalid names (PRODUCT 13); copy auto-suffix (PRODUCT 15); move ancestor refusal + destination collision (PRODUCT 16–17); create collision (PRODUCT 40); delete-to-trash smoke test (note: trash may be flaky in CI — assert no error, and if the platform refuses, fall back to asserting the pre-delete state is unchanged).
- **Frontend unit tests** (add `vitest` + script `"test": "vitest run"`): `mdBlocks` preserves exact source ranges for every block kind (basis of PRODUCT 31); `domToMarkdown` round-trips each construct (bold → `**…**`, headings → `# …`, nested lists, links, images, blockquotes) (PRODUCT 28, 31); untouched blocks serialize byte-identically after a dirty sibling is edited (PRODUCT 31); `history` undo/redo behaves identically across view switches (PRODUCT 32).
- **Existing gates**: `pnpm check`, `pnpm build`, `cd src-tauri && cargo check` (and a full `cargo build` before packaging).
- **Manual E2E checklist** (against PRODUCT invariants): add/switch/remove vault with a real folder incl. a missing folder (1–5); single-branch expansion and per-vault chain (8); every context-menu operation incl. cut-dimming, trash restore, and duplicate rejection (12–20); tab open/close/restore + dirty prompts (21–24); toggle round-trip on a doc containing tables + raw HTML (31); undo/redo across views (32); autosave + edit-the-file-externally conflict → Overwrite/Reload/Cancel (34–39); keyboard shortcuts and editor focus return (41–43); Notes view hidden library chrome; browser preview virtual vault + frontmatter tab naming and Rich-view hiding (44–45).

## Parallelization

`run_agents` is not available in this environment, and FractalGrab is a single shared checkout with no git repo (no branches or worktrees to isolate parallel work). The Rust command surface, `backend.ts` adapter, store, and components are tightly coupled through the command API. Implementation should therefore be sequential in dependency order: (1) Rust `notes.rs` + `Cargo.toml` + tests, (2) types + `backend.ts`, (3) notes store + editor primitives (`mdBlocks`, `domToMarkdown`, `history`) + their tests, (4) components + shell integration, (5) end-to-end verification. If sub-agents become available later, the only clean split is Rust (commands + tests) versus frontend, gated by freezing the command API in step 1.

## Risks and mitigations

- **contentEditable round-trip is the highest-risk area.** Mitigated by: per-block source cache + dirty flags (untouched blocks byte-identical), read-only blocks for constructs the serializer doesn't own, paste-as-plain-text, and unit tests pinning every editable construct. Accept that rich view is a structured editor, not a byte-preserving one for exotic Markdown — raw view is always available as the source of truth.
- **mtime conflict granularity** (PRODUCT 36): mtime comparisons can miss same-millisecond writes; acceptable for a single-user desktop app. If it proves flaky, fall back to a cheap content hash stored at read time.
- **Close-flush timing**: WKWebView `beforeunload` is unreliable; the Tauri `onCloseRequested` handler (prevent default → flush → destroy) is the only correct hook — wire it at store init, not in a component.
- **Context-menu collision**: the window-level listener already matches `data-item-id`/`data-col-id`; vault rows must use a distinct `data-vault-path` and be checked in `onContextMenu` before the blank branch, or the two systems will fight.
- **New dependency weight** (CodeMirror 6, `trash`, `markdown-it`, `vitest`): justified — text editing and OS-trash are exactly what these crates are for; bundle is a desktop app, not a web page.
- **Non-UTF-8 filenames**: existing code uses `to_string_lossy`; vault commands should do the same and never crash on exotic names.

## Follow-ups

- OS file watching for the tree (PRODUCT currently relies on refresh-on-focus + manual Refresh).
- Drag-and-drop move within the tree (cut/paste is the specified mechanism).
- Vault-wide full-text search; `linkify` in rich view; insert-image support from raw view; optional per-note metadata (frontmatter-aware titles in tabs).
