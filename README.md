# FractalGrab

**Your own visual bookmark manager for Mac.** A native Tauri app with a
SvelteKit frontend, built on your fractal stack (Svelte 5 runes +
fractals-styler). Personal, private, local-first: everything is real files in a
visible Finder folder — nothing proprietary, no account, no lock-in.

## Quick start

```bash
pnpm install
pnpm dev            # frontend in the browser (demo library, localStorage)
pnpm tauri dev      # the full desktop app
pnpm check          # typecheck
pnpm build          # frontend production build
cd src-tauri && cargo check
```

> `pnpm tauri …` currently trips pnpm 11's pre-run deps check on the
> ignored-builds warning; if that happens, run the binary directly:
> `./node_modules/.bin/tauri dev` (icons were generated with `tauri icon`).

The app runs standalone in a browser too — `pnpm dev` seeds a demo library and
stores everything in localStorage, so the whole UI is testable without Tauri.

## How it works

- **Library folder** — default `~/Downloads/fractalgrab` (changeable in
  Settings; changing it copies your files across). Every saved item is a real
  file: `.webloc` for links, the actual image/video for media, `.md` for notes,
  plus `Name.favicon.png` and the key image beside it.
- **`fractalgrab.json`** — the manifest (items, collections, tags, notes,
  colours, settings) lives in the library folder, so the folder is the
  database. New files dropped into the folder show up as "untracked" and can be
  imported with one click. Rename/delete items and the real file follows.
- **Rust core (`src-tauri`)** — saves URLs by fetching the page (title,
  favicon, og:image) and writing a `.webloc`; copies dropped/pasted files;
  renames, deletes, opens, reveals in Finder; runs scheduled zip backups
  (default every 6h, keeps 14) and a localhost extension server on port 48123.

## Feature map (from app_features.md)

| Feature | Status |
|---|---|
| Save links / images / files / notes instantly, no confirm | ✅ (paste, drag-drop, URL, file picker) |
| Real files in a visible Finder folder, auto-renamed | ✅ |
| One-click downloads, exportable, nothing proprietary | ✅ |
| Live browser clipper (Chrome MV3 extension) | ✅ `extension/` — right-click page/link/image/selection, or pick an element; saves via localhost only |
| Imports: CSV, JSON, browser bookmarks HTML (folders → collections) | ✅ |
| Scheduled backups, even while closed | ✅ zip backups on a schedule (in-app scheduler; a launchd agent is the remaining piece for “while closed”) |
| Nested collections, one item in many, no duplication | ✅ |
| Your own tags alongside AI tags | ✅ (AI tags need your provider key) |
| AI-matched collection icons | ✅ client-side keyword matching, manually cyclable |
| Living bookmarks (title, favicon, key image) | ✅ for link saves |
| Notes on items | ✅ |
| Batch actions (file, tag, favourite, delete) | ✅ shift-click / selection bar |
| Moodboard / Cards / List views + Timeline | ✅ |
| Matching colour backdrop behind images | ✅ dominant-colour gradient |
| Drag out to Mail/Slack/Finder as a real file | ⚠️ reveal-in-Finder + open instead (WKWebView can’t drag out) |
| The Canvas — freeform arrangement, export | ✅ PNG + PDF (dependency-free PDF writer) |
| Copy any colour from a card | ✅ hover dots, named colours |
| Find similar | ✅ colour-based, in the info panel |
| Search: text (title/url/note/tags/OCR), colour name/hex | ✅ |
| Full-sentence / semantic search | ✅ with an OpenAI-compatible key (Enter or “AI” in search) |
| On-device OCR | ✅ tesseract.js, text searchable afterwards |
| Visual search across the web | ❌ needs a reverse-image provider — not wired |
| AI art prompts from images | ✅ with a key (multimodal) |
| AI renames filenames | ✅ with a key |
| Screen-screenshot capture | ❌ needs native screen-capture APIs — not in this build |
| Safari extension | ❌ roadmap |

## AI

Bring your own OpenAI-compatible endpoints (Settings → AI): add **multiple
providers** (e.g. OpenAI, Anthropic, a local Ollama server — any
OpenAI-compatible base URL), each with its own key and any number of models,
and pick the active model. Used for tagging, filename renaming, full-sentence
search, and art prompts. Nothing is sent unless you turn it on and use it;
everything else runs on-device.

## Docs

- `CLASSES.md` — every container/component class name, for styling edits
- `DEV.md` — how to run, build, and debug (browser, desktop, extension, gotchas)

## Extension

`extension/` is a Chrome MV3 clipper. Load it unpacked (chrome://extensions →
Developer mode → Load unpacked), turn on the extension server in FractalGrab
Settings, then right-click anywhere on the web. It talks only to
`http://127.0.0.1:48123`.

## Verified

- `pnpm check` — 0 errors, 10 warnings (a11y, cosmetic)
- `pnpm test` — 50/50 passed
- `pnpm build` — clean SPA build
- `cargo check` — clean (8 snake_case warnings, cosmetic)
- `cargo test` — 10/10 passed
- Browser preview exercised: capture, search, colour dots, detail panel,
  settings, canvas view, collections tree, notes workspace.

## What's new (v0.3.0)

- **Window-state persistence** — window size/position saved between launches
- **Resizable sidebar** — drag the sidebar edge; width persisted
- **Keyboard shortcuts** — Cmd+/ opens a cheat sheet
- **Onboarding** — first-launch wizard (welcome, library folder, shortcuts)
- **Loading skeletons** — shimmer-animated placeholders
- **OS file-watching** — vault tree updates live
- **launchd agent** — backups run while the app is closed
- **Manifest race fixed** — shared mutex prevents lost writes from extension
- **A11y warnings fixed** — 55 → 10 (cosmetic only)

## Known limits

- `~/Downloads/fractalgrab` default library path (spec says “Downloads”; it
  lives *inside* Downloads so your actual Downloads stay clean).
- Tesseract OCR language data loads from the CDN on first use (offline
  caching of `tessdata` is a small follow-up).
- Code signing not configured (personal-use app; right-click → Open to
  bypass Gatekeeper).
