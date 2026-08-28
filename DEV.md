# FractalGrab — Development Guide

How to run, build, and debug the app. Stack: **Tauri v2 (Rust)** + **SvelteKit 5
(Svelte 5 runes)** + **fractals-styler** + Vite, managed with **pnpm**.

## Prerequisites

- Node 22+, pnpm (workspace uses pnpm 11)
- Rust toolchain (stable, with `cargo`)
- macOS (Tauri targets); the frontend alone runs on any OS

## First-time setup

```bash
cd fractalgrab
pnpm install
```

If pnpm blocks native build scripts (esbuild / tesseract / etc.), approve them
once with `pnpm approve-builds` (interactive) or add them to
`onlyBuiltDependencies` in `pnpm-workspace.yaml` and re-run `pnpm install`.
This project already ships that allowlist in `pnpm-workspace.yaml`.

## Running — three modes

### 1. Browser only (fastest, no Rust)

```bash
pnpm dev
```

Opens the frontend at **http://localhost:5173** (Vite dev server). The app
detects it is not inside Tauri and switches to browser mode: it seeds a demo
library and persists to `localStorage`. Great for UI work — no compile step.

### 2. Desktop dev (full app)

```bash
./node_modules/.bin/tauri dev
```

Tauri runs `pnpm dev` for the frontend, compiles the Rust core, and opens a
native window wired to real files (library at `~/Downloads/fractalgrab` by
default).

> ⚠️ **pnpm 11 gotcha:** `pnpm tauri dev` may abort on pnpm's pre-run
> "deps status check" (it complains about ignored build scripts) before Tauri
> even starts. Use the binary directly — `./node_modules/.bin/tauri dev` —
> or `pnpm exec tauri dev`. The npm `tauri` script still exists for other
> contexts.

First Rust compile takes a few minutes; later ones are incremental.

### 3. Production desktop app

```bash
./node_modules/.bin/tauri build
```

Builds the SPA (`pnpm build`), compiles Rust in release mode, and produces
`.app` / `.dmg` bundles in `src-tauri/target/release/bundle/`.

## Checks & builds

```bash
pnpm check        # svelte-check typecheck (fast, run often)
pnpm test         # vitest unit tests (editor round-trip core, history)
pnpm build        # SPA production build → build/
cd src-tauri && cargo check    # Rust typecheck only (fast, no linking)
cd src-tauri && cargo test notes   # Rust unit tests for the notes module
cd src-tauri && cargo build    # full Rust build
```

## Icons

Icons live in `src-tauri/icons/`. To regenerate the full set from one source
image (e.g. `scripts/gen-icon.mjs` output or a 1024px PNG):

```bash
./node_modules/.bin/tauri icon src-tauri/icons/icon.png
```

The `scripts/gen-icon.mjs` script draws the fractal logo with pure Node (no
deps) — run `node scripts/gen-icon.mjs` to recreate `icon.png`.

## Browser clipper extension

`extension/` is a Chrome MV3 extension.

1. In FractalGrab: Settings → toggle **Extension server** on (listens on
   `127.0.0.1:48123` — local only).
2. In Chrome: `chrome://extensions` → enable **Developer mode** → **Load
   unpacked** → pick `fractalgrab/extension/`.
3. Right-click any page / link / image / selection to clip into FractalGrab.

## Project layout

```
fractalgrab/
├── src/                     # SvelteKit frontend
│   ├── lib/
│   │   ├── types.ts         # Item / Collection / Provider / Manifest types
│   │   ├── backend.ts       # adapter: tauri invoke() in desktop, mock in browser
│   │   ├── store.svelte.ts  # reactive state ($state runes) + all actions
│   │   ├── mock.ts          # browser-mode seed library
│   │   ├── notes/
│   │   │   ├── notes.svelte.ts  # notes store: vaults, tree, tabs, autosave, undo/redo
│   │   │   ├── mdBlocks.ts     # markdown → block model with byte-exact sources + frontmatter
│   │   │   ├── domToMarkdown.ts# rich-editor DOM → markdown serializer
│   │   │   ├── history.ts      # snapshot undo/redo stack
│   │   │   └── *.test.ts       # vitest unit tests
│   │   ├── color.ts         # dominant colour + colour names
│   │   ├── ocr.ts           # tesseract.js wrapper
│   │   ├── ai.ts            # multi-provider OpenAI-compatible client
│   │   ├── importers.ts     # CSV / JSON / bookmarks HTML
│   │   ├── pdf.ts           # dependency-free canvas PDF export
│   │   ├── iconSuggest.ts   # collection icon matching
│   │   ├── components/      # all UI components (notes/ holds the Notes workspace)
│   │   │   ├── KeyboardShortcuts.svelte  # Cmd+/ shortcut reference modal
│   │   │   ├── Onboarding.svelte         # first-launch welcome wizard
│   │   │   ├── Skeleton.svelte           # loading skeleton placeholders
│   │   └── styles/          # fractals-styler partials + project blocks (_blocks.sass)
│   ├── routes/+page.svelte  # the whole app shell
│   └── routes/+layout.ts    # SPA (ssr=false, prerender off)
├── src-tauri/               # Rust core
│   ├── src/lib.rs           # file ops, library, backups, commands
│   ├── src/notes.rs         # notes commands: vaults, scan, read/write+conflict, file ops
│   ├── src/http_server.rs   # extension server (:48123)
│   ├── src/main.rs          # Tauri entry
│   └── tauri.conf.json      # window, bundle, icons
├── extension/               # Chrome clipper
├── scripts/                 # backup-agent.sh (launchd), gen-icon.mjs
├── STEWARDSHIP.md           # product stewardship plan & roadmap
├── PRODUCT.md               # product spec (Notes module behavior)
├── PRODUCT-TECH.md          # tech spec (Notes module implementation plan)
├── CLASSES.md               # full class-name reference for styling
├── CONTEXT.md               # session context (historical)
└── DEV.md                   # this file
```

## Architecture notes

- **The library folder is the database.** Each item is a real file (`.webloc`
  for links, the image/video itself, `.md` for notes) plus
  `fractalgrab.json` (manifest: items, collections, tags, colours, settings).
  The Rust side scans the folder; new files appear as "untracked".
- **Store** (`store.svelte.ts`) is a plain module of Svelte 5 `$state` runes.
  Everything exported is either a getter/setter pair or a function — never an
  `export let` / `export const $state` binding (the Svelte compiler forbids
  exporting reactive bindings from modules; the build fails otherwise).
- **Backend adapter** (`backend.ts`) picks Tauri commands when
  `window.__TAURI_INTERNALS__` exists, else a mock/localStorage backend.
- **Styling** is the fractals-styler system (`src/lib/styles/`): tokens,
  utilities/primitives, compositions and the `.button` block from the package
  scaffold, plus FractalGrab's own component blocks in `_blocks.sass`. Every
  class is documented in `CLASSES.md` — edit the owning partial, not scattered
  inline styles.
- **Notes module** (sixth view) owns markdown vaults and documents end to end.
  Rust commands in `src-tauri/src/notes.rs` handle vault registration
  (persisted in the app `config.json`), recursive tree scans, read/write with
  **mtime-based conflict detection** (`notes_write` returns `conflict: true`
  without writing), and rename/trash/copy/move/create. The frontend adapter
  (`backend.ts`) mirrors them; browser preview runs an in-memory virtual vault
  so the UI is testable without Tauri.
- **Editor round-trip core** (`src/lib/notes/`): `mdBlocks` splits source into
  blocks carrying their exact source text (code, tables, raw HTML and YAML
  frontmatter are read-only blocks); `domToMarkdown` serializes the rich
  editor's DOM back to markdown; only edited blocks are re-serialized, so
  untouched content round-trips byte-for-byte. Raw view is CodeMirror 6 with
  native undo/redo disabled — the store's shared `history.ts` stack serves both
  views. Frontmatter `title:` names the tab and hides the redundant leading `#`
  h1 in Rich view.
- **Autosave**: per-tab 1s debounce → `notes_write` with the expected mtime;
  disk conflicts back off (dirty stays set) and the explicit Save opens an
  Overwrite / Reload / Cancel dialog. Pending saves flush on window close via
  Tauri `onCloseRequested`.
- **Manifest**: `fractalgrab.json` writes are serialized through a shared
  `Mutex<Option<serde_json::Value>>` cache in `AppState`. Both the webview's
  `persist()` and the extension server's `save_ext_item` go through
  `manifest_read`/`manifest_write`, so concurrent writes can't lose data.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `pnpm tauri …` dies with a deps-status error | run `./node_modules/.bin/tauri …` directly |
| Build fails: "Cannot export state from a module" | exported `$state`/`$derived` must become getters/setters or functions (see store) |
| Sass error on `background:` multi-line value | flatten the value onto one line (indented-syntax quirk) |
| Extension can't connect | FractalGrab Settings → Extension server toggle must be ON; only `127.0.0.1:48123` is accepted |
| OCR fails to load | tesseract.js downloads language data from the CDN on first use — check network; local tessdata caching is a known follow-up |
| Browser mode shows demo data | expected — real files only exist inside Tauri; browser mode is for UI iteration |
| Port 5173 in use | `pnpm dev --port 5174` (update `tauri.conf.json` → `devUrl` if you also run the desktop app) |
| Notes view shows an in-memory vault in the browser | expected — real vaults need Tauri; preview seeds a `/Vault` with demo docs so the Notes UI is exercisable |
| Frontmatter title not showing on a tab | the title is read when the document opens; edit + reopen the file to refresh |
