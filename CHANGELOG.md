# Changelog

All notable changes to FractalGrab are documented here.

## v0.3.0 — August 28, 2026

### Added

- **Window-state persistence** — window size and position are automatically saved and restored between launches via `tauri-plugin-window-state`
- **Resizable sidebar** — drag the sidebar edge to resize (160–420px); width persists in manifest settings
- **Keyboard shortcut reference** — press Cmd+/ (or Ctrl+/) to open a modal listing all keyboard shortcuts
- **First-launch onboarding** — 3-step wizard on first launch: welcome screen, library folder picker, and shortcuts overview
- **Skeleton loading component** — shimmer-animated placeholders for cards, lists, and rows
- **Improved loading screen** — larger brand mark, centered layout, fade-in animation
- **OS file-watching for vault tree** — vault tree updates live via FSEvents (no manual refresh needed)
- **launchd agent for backups** — scheduled zip backups run even when the app is closed
- **Autosave & tab persistence tests** — 6 new tests for autosave lifecycle, conflict flow, and tab state
- **Dark mode verification** — all new components use CSS tokens; verified no hardcoded colors break in dark mode

### Fixed

- **Manifest two-writer race condition** — `fractalgrab.json` writes are now serialized through a shared `Mutex<Option<serde_json::Value>>` cache in `AppState`, preventing lost writes between the webview and extension server
- **A11y warnings** — batch-fixed 55 warnings down to 10 (cosmetic only: overlay divs and treeitem aria)
- **Deprecated `svelte:self`** — replaced with `{#snippet}` pattern for Svelte 5 compliance
- **Per-tab view persistence** — Raw/Rich editor preference now persists across sessions (was resetting to Rich every launch)

### Changed

- Added `@tauri-apps/plugin-window-state` dependency (Rust + JS)
- Added `notify` crate (Rust) for filesystem watching
- Added `sidebarWidth` to `Settings` type
- Updated `tauri.conf.json` with window label, signing config placeholder, and minimum macOS version
- Updated capabilities to include `core:window:default` and `window-state:default`

## v0.1.0 — August 28, 2026

Initial public release.

### Features

- Save links, images, files, and notes instantly (paste, drag-drop, URL, file picker)
- Real files in a visible Finder folder (`.webloc` for links, actual media, `.md` for notes)
- Browser clipper extension (Chrome MV3) via localhost:48123
- Nested collections, tags, favourites, AI tags
- 5 views: Moodboard, Cards, List, Timeline, Canvas
- Search: text, colour, AI semantic
- Import: CSV, JSON, browser bookmarks HTML
- Scheduled zip backups (in-app scheduler)
- AI features: tagging, rename, art prompts, semantic search
- On-device OCR (tesseract.js)
- Colour features: backdrop, dots, copy, similar
- Canvas: freeform arrangement, export PNG/PDF
- Batch actions: file, tag, favourite, delete
- Drag-dial for collection assignment
- Notes workspace: vaults, tree, dual-mode editor (Raw/Rich), tabs, autosave, undo/redo, conflict detection
