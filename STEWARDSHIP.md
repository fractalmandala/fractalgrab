# FractalGrab — Product Stewardship Plan

**Date:** August 28, 2026  
**Current state:** v0.1.0 — all gates green, Notes module ~95% spec-complete  
**Target:** v1.0.0 — a product you can daily-drive on your Mac

---

## Table of Contents

1. [Product Health Dashboard](#1-product-health-dashboard)
2. [Engineering Quality & Code Health](#2-engineering-quality--code-health)
3. [Design & UI System](#3-design--ui-system)
4. [Feature Completeness: v0.1 → v1.0](#4-feature-completeness-v01--v10)
5. [Risk Register](#5-risk-register)
6. [v1.0 Spec — What Ships](#6-v10-spec--what-ships)
7. [Milestone Roadmap](#7-milestone-roadmap)
8. [Process & Governance](#8-process--governance)

---

## 1. Product Health Dashboard

### Current Metrics (August 28, 2026)

| Metric | Value | Status |
|---|---|---|
| `pnpm check` errors | 0 | 🟢 |
| `pnpm check` warnings | 55 (a11y) | 🟡 |
| `pnpm test` | 36/36 passed | 🟢 |
| `cargo check` | Clean (7 warnings) | 🟡 |
| `cargo test` | 10/10 passed | 🟢 |
| Frontend components | 21 Svelte files | — |
| Rust source files | 4 modules | — |
| Total codebase (core files) | ~3,700 LOC (store, backend, types, lib.rs, notes.rs, notes store) | — |
| Test coverage areas | mdBlocks, domToMarkdown, history, Rust notes commands | 🟡 (no component/integration tests) |
| Git repo | **None** | 🔴 Critical |

### What "Healthy" Looks Like at v1.0

| Gate | Target |
|---|---|
| Typecheck errors | 0 |
| Warnings | <10 (ideally 0) |
| Frontend unit tests | >80 (core logic + store actions) |
| Rust unit tests | >25 (all commands, edge cases) |
| Build | `pnpm build` + `cargo build` clean |
| Manual E2E | Every product spec item verified in Tauri mode |
| Bundle size | <25 MB `.dmg` |
| Cold launch | <3 seconds to interactive |

---

## 2. Engineering Quality & Code Health

### 2.1 Repository & Version Control

**🔴 Priority: Init git immediately.** This is the single highest-risk item. A power outage or accidental edit could erase the entire project.

- Init repo with `.gitignore` covering `node_modules/`, `src-tauri/target/`, `build/`, `.svelte-kit/`, `.DS_Store`
- Initial commit of the full current state
- Tag as `v0.1.0`

### 2.2 Known Race Condition

The `fractalgrab.json` manifest has two concurrent writers (webview `persist()` and extension server `save_ext_item`). The self-heal via "untracked files" bar works but is fragile.

**Plan:** Introduce a simple mutex (file-level lock or in-memory flag) so only one writer touches the manifest at a time. Target: v1.0 RC.

### 2.3 Rust Warnings

7 snake_case warnings in `http_server.rs` (camelCase struct fields matching JSON). These are cosmetic — the struct is deserialized via serde with `#[serde(rename)]` or default rename rules. Fix by adding `#[serde(rename = "imageFile")]` attributes to keep the JSON contract clean while satisfying Rust conventions.

### 2.4 Test Gaps

| Area | Current | Needed for v1 |
|---|---|---|
| mdBlocks | 21 tests ✅ | Add edge cases: nested lists, deep blockquotes, mixed tables |
| domToMarkdown | 10 tests ✅ | Add: images, links with titles, nested blockquotes, task lists |
| history | 5 tests ✅ | Add: cross-view shared history, coalescing |
| Rust notes | 10 tests ✅ | Add: large file, concurrent access, symlink edge cases |
| **Store actions** | 0 tests ❌ | Add: addVault, openPath, autosave lifecycle, tab state |
| **Backend adapter** | 0 tests ❌ | Add: browser mock parity tests |
| **Component smoke** | 0 tests ❌ | Consider svelte-testing-library for critical paths |
| **E2E / Playwright** | 0 tests ❌ | Nice-to-have for v1; at minimum a manual checklist doc |

### 2.5 Dependency Audit

Current dependencies are lean and justified:

| Dep | Purpose | Risk |
|---|---|---|
| CodeMirror 6 (~400 KB) | Raw editor | Low — defensible for desktop |
| markdown-it | Rich view rendering | Low — battle-tested |
| tesseract.js | OCR | Low — CDN data load on first use; offline caching is a follow-up |
| trash (Rust crate) | OS trash | Low |
| reqwest, tokio, zip, chrono, regex, base64, uuid, serde | Rust core | Low — all well-established |

No bloated or unnecessary dependencies. The bundle is a desktop app, not a web page.

### 2.6 Build & Release Pipeline

Currently manual. For v1.0:

- Add a `Makefile` or `justfile` with targets: `check`, `test`, `build`, `release`
- Automate `.dmg` creation via `tauri build`
- Consider GitHub Actions for CI (typecheck + test on push)
- Code signing: required for distribution outside Homebrew/manual install

---

## 3. Design & UI System

### 3.1 Styling Architecture

The fractals-styler system is well-organized: tokens → utilities → compositions → project blocks. CLASSES.md is a living reference with every class documented.

**Health:** 🟢 — consistent naming, data-attribute state, scoped styles for Notes module.

### 3.2 A11y Warnings (55)

These are pre-existing and fall into predictable categories:

| Category | Count (est.) | Fix strategy |
|---|---|---|
| Tree item missing `role="treeitem"` / `aria-expanded` | ~15 | Add ARIA roles to `TreeItem.svelte` and `VaultTreeItem.svelte` |
| `autofocus` attribute warnings | ~5 | Remove or gate behind user preference |
| Div with `onclick` missing keyboard handler | ~20 | Add `onkeydown` + `role="button"` + `tabindex="0"` where interactive |
| Missing `alt` / `aria-label` on icons | ~10 | Add `aria-label` to icon-only buttons |
| Contenteditable warnings | ~5 | Already have `role="textbox"` + `aria-multiline`; suppress remaining |

**Plan:** Batch-fix these in one focused session. Target: v1.0.

### 3.3 Visual Polish for v1.0

Items that elevate the app from "functional" to "daily-driver quality":

- [ ] **Empty states** — polish the "no vault" and "empty collection" screens with illustrations or guidance text
- [ ] **Loading states** — skeleton screens for vault scan, library load, search
- [ ] **Transitions** — subtle view-switch animations (crossfade), tab open/close
- [ ] **Dark mode** — verify every component works with dark tokens (the token system supports it; confirm no hardcoded colors)
- [ ] **Font sizing** — test at large accessibility sizes
- [ ] **Window resize behavior** — verify sidebar/detail panels reflow gracefully at minimum window size (960×600)
- [ ] **Onboarding** — first-launch experience: welcome screen, explain library folder, point to Settings

---

## 4. Feature Completeness: v0.1 → v1.0

### What's Done (shippable today)

| Feature | Quality |
|---|---|
| Save links/images/files/notes | 🟢 Solid |
| Real files in Finder folder | 🟢 Solid |
| Browser clipper extension | 🟢 Solid |
| Collections, tags, favourites | 🟢 Solid |
| 5 views (Moodboard, Cards, List, Timeline, Canvas) | 🟢 Solid |
| Search (text, colour, AI semantic) | 🟢 Solid |
| Import (CSV, JSON, bookmarks HTML) | 🟢 Solid |
| Backup scheduler | 🟡 Scheduler works; launchd agent missing |
| AI features (tagging, rename, art prompts, semantic search) | 🟢 Solid |
| On-device OCR | 🟡 Works; CDN dependency, no offline cache |
| Notes workspace (vaults, tree, editor, tabs, autosave) | 🟡 ~95% spec-complete |
| Colour features (backdrop, dots, copy, similar) | 🟢 Solid |
| Canvas (freeform, export PNG/PDF) | 🟢 Solid |
| Batch actions | 🟢 Solid |
| Drag-dial for collection assignment | 🟢 Solid |

### What's Missing for v1.0

| Item | Priority | Effort | Blocks v1? |
|---|---|---|---|
| Git repo | P0 | 30 min | Yes — no version control = no safety net |
| Notes: OS file-watching | P1 | Half day | No, but UX pain |
| Notes: Per-tab view persistence | P1 | 2 hours | Minor annoyance |
| Notes: Overwrite/Reload/Cancel in real Tauri | P1 | 1 hour testing | Yes — core flow unverified |
| Backups: launchd agent | P2 | Half day | No — in-app scheduler works |
| OCR: Offline tessdata caching | P2 | Half day | No — CDN works for connected use |
| a11y warning fix | P2 | Half day | No, but polish |
| Onboarding flow | P2 | Half day | No, but important for new users |
| Error recovery polish | P2 | 1 day | Yes — users must never lose data |
| Visual polish (transitions, loading, empty states) | P3 | 1–2 days | No, but quality bar |
| Dark mode verification | P3 | Half day | No |
| Code signing | P1 | 1–2 days | Yes for distribution |
| `.dmg` packaging | P1 | Half day | Yes for distribution |

---

## 5. Risk Register

### 🔴 Critical

| Risk | Impact | Mitigation |
|---|---|---|
| **No git repo** | Catastrophic data loss possible | Init repo immediately, commit everything |
| **Data loss on crash** | Unflushed autosaves could be lost | Flush-on-close is wired; verify in Tauri with force-quit scenarios |
| **Manifest race condition** | Momentary item loss (self-heals via untracked bar) | Add file-level lock or single-writer pattern |

### 🟡 High

| Risk | Impact | Mitigation |
|---|---|---|
| **contentEditable round-trip drift** | Rich view edits could corrupt Markdown source | Per-block source cache + byte-preserving untouched blocks + tests |
| **mtime conflict edge case** | Same-millisecond external edit could be silently overwritten | Content-hash fallback if mtime proves flaky |
| **Tauri version stability** | Tauri v2 is relatively new; breaking changes possible | Pin versions, monitor changelogs, update deliberately |
| **pnpm 11 build friction** | `pnpm tauri dev` fails on pre-run check | Already documented workaround; could break on pnpm updates |
| **No code signing** | macOS Gatekeeper blocks unsigned apps | Required for v1.0 distribution |

### 🟢 Low

| Risk | Impact | Mitigation |
|---|---|---|
| OCR CDN dependency | Offline OCR fails on first use | Offline tessdata caching (follow-up) |
| 55 a11y warnings | Accessibility incomplete | Batch fix before v1.0 |
| Single-platform (macOS) | No Windows/Linux | By design; frontend runs anywhere, Tauri targets Mac |

---

## 6. v1.0 Spec — What Ships

### v1.0 is "Daily-Drive Ready"

The v1.0 bar is: **I can open this app every day and trust it with my bookmarks and notes.** It's not "every possible feature" — it's "reliable, polished, and complete enough that I reach for it instead of other tools."

### v1.0 Feature Set

Everything in v0.1.0 **plus**:

#### Must-Have (no ship without these)

1. **Git-tracked codebase** — version control for all future work
2. **Notes module fully spec-complete** — all 45 items in PRODUCT.md verified in Tauri mode
3. **Conflict flow verified end-to-end** — Overwrite/Reload/Cancel tested against real file edits
4. **Autosave reliability** — flush-on-close works, crash recovery tested, data loss impossible
5. **Onboarding** — first-launch guide: explain the library folder, offer to set location, show keyboard shortcuts
6. **Code signing** — `.dmg` installs without Gatekeeper warnings
7. **Backup launchd agent** — backups run even when the app is closed
8. **Zero data-loss scenarios** — every edge case (crash, permission denied, disk full, file deleted externally) handled gracefully with user-facing messages

#### Should-Have (strong preference to include)

9. **a11y warnings resolved** — fewer than 5 remaining
10. **Notes: file-watching** — vault tree updates live without manual refresh
11. **Notes: per-tab view persistence** — remember Raw/Rich preference
12. **OCR offline caching** — tessdata stored locally after first download
13. **Error toast system** — consistent, informative, dismissable notifications for all error states
14. **Visual polish** — loading skeletons, smooth transitions, polished empty states
15. **Keyboard shortcut reference** — in-app cheat sheet (Cmd+/)

#### Nice-to-Have (include if time permits, defer otherwise)

16. Dark mode verification pass
17. Window-state persistence (size, position, sidebar width)
18. Spotlight / Quick Look integration
19. Menu bar notifications for extension saves
20. "What's New" modal after updates

### v1.0 Explicitly Excludes

These are post-1.0 roadmap items:

- Safari extension
- Screen capture (needs native APIs)
- Visual/reverse-image search
- iCloud sync or collaboration
- Windows/Linux ports
- Mobile companion
- Plugin system
- AI-generated summaries or chat

---

## 7. Milestone Roadmap

### Phase 0: Foundation (Days 1–2) — **This Week**

| Task | Est. | Priority |
|---|---|---|
| Init git repo, initial commit, tag v0.1.0 | 30 min | P0 |
| Run full `pnpm check` + `pnpm test` + `cargo test` baseline | 30 min | P0 |
| Document the race condition in an issue tracker (or STEWARDSHIP.md) | 15 min | P1 |

### Phase 1: Notes Polish (Days 3–7)

| Task | Est. | Priority |
|---|---|---|
| Verify conflict flow in real Tauri session | 1 hr | P1 |
| Implement OS file-watching for vault tree (fswatch / FSEvents via Rust) | 4 hrs | P1 |
| Add per-tab view persistence (store in `settings.notes`) | 2 hrs | P1 |
| Offline tessdata caching | 3 hrs | P2 |
| Add launchd agent for backup-while-closed | 3 hrs | P2 |
| Rust warning cleanup (snake_case in http_server.rs) | 30 min | P2 |

### Phase 2: Quality & A11y (Days 8–12)

| Task | Est. | Priority |
|---|---|---|
| Fix all 55 a11y warnings | 4 hrs | P2 |
| Add store action unit tests (addVault, openPath, autosave lifecycle) | 4 hrs | P1 |
| Add backend adapter parity tests | 3 hrs | P1 |
| Add edge-case tests for mdBlocks, domToMarkdown, history | 3 hrs | P1 |
| Manifest race condition fix (single-writer) | 4 hrs | P1 |
| Error recovery audit — every failure path tested | 4 hrs | P1 |

### Phase 3: Polish & Onboarding (Days 13–17)

| Task | Est. | Priority |
|---|---|---|
| First-launch onboarding flow | 4 hrs | P2 |
| Loading skeletons and transitions | 3 hrs | P3 |
| Empty state polish | 2 hrs | P3 |
| Dark mode verification pass | 3 hrs | P3 |
| In-app keyboard shortcut reference | 1 hr | P3 |
| Window-state persistence | 2 hrs | P3 |

### Phase 4: Ship (Days 18–21)

| Task | Est. | Priority |
|---|---|---|
| Code signing setup (Apple Developer account) | 2–4 hrs | P1 |
| `.dmg` packaging and installer testing | 2 hrs | P1 |
| Full E2E manual test pass against v1.0 spec | 4 hrs | P1 |
| Version bump to 1.0.0 | 15 min | P1 |
| Tag v1.0.0, write release notes | 1 hr | P1 |
| README update with install instructions | 1 hr | P2 |

### Timeline

```
Week 1 (Sep 1–5):    Phase 0 + Phase 1  — Foundation + Notes polish
Week 2 (Sep 8–12):   Phase 2             — Quality & a11y
Week 3 (Sep 15–19):  Phase 3             — Polish & onboarding
Week 4 (Sep 22–26):  Phase 4             — Ship v1.0

Target: FractalGrab v1.0.0 ships September 26, 2026
```

This is an **aggressive but achievable** 4-week sprint if worked on consistently. If work is part-time, double the timeline to **mid-October**.

---

## 8. Process & Governance

### 8.1 Development Workflow

After git init, establish:

1. **Feature branches** — one branch per phase/task, merge to `main` when gates pass
2. **Pre-merge checklist:** `pnpm check` (0 errors) + `pnpm test` (all pass) + `cargo check` (clean) + `cargo test` (all pass)
3. **Commit style:** descriptive, imperative mood, reference the area (e.g. "notes: fix rich-view input handler for host-targeted events")
4. **Tag every milestone** — v0.2.0 after Phase 1, v0.3.0 after Phase 2, v0.9.0 after Phase 3, v1.0.0 at ship

### 8.2 Code Review

Solo project, but discipline still matters:

- Read every diff before committing
- Run checks before merging to `main`
- Write a brief commit message explaining *why*, not just *what*
- Keep `PRODUCT.md` and `PRODUCT-TECH.md` in sync with implementation changes

### 8.3 Documentation Maintenance

| Doc | Update cadence |
|---|---|
| PRODUCT.md | When behavior changes |
| PRODUCT-TECH.md | When implementation plan changes |
| CLASSES.md | When new classes are added |
| DEV.md | When build/run steps change |
| STEWARDSHIP.md | At each milestone review |
| CHANGELOG.md (new) | At each tagged release |

### 8.4 Bug Triage

When bugs are found:

1. **P0 (data loss / crash):** Fix immediately, do not defer
2. **P1 (feature broken):** Fix within current phase
3. **P2 (degraded experience):** Fix before v1.0
4. **P3 (cosmetic / edge case):** Backlog, may defer to v1.1

### 8.5 Health Checks

At each milestone, run and record:

```bash
pnpm check          # 0 errors
pnpm test           # all pass
pnpm build          # clean
cd src-tauri && cargo check   # clean
cd src-tauri && cargo test    # all pass
# Manual: open in Tauri, exercise core flows
```

---

## Summary

| Item | Status | Action |
|---|---|---|
| Core product | 🟢 Feature-rich, well-architected | Ship it |
| Notes module | 🟡 95% complete | Polish in Phase 1 |
| Testing | 🟡 Good core coverage, gaps in store/components | Expand in Phase 2 |
| A11y | 🟡 55 warnings | Batch fix in Phase 2 |
| Version control | 🔴 None | Init immediately |
| Distribution | 🔴 No code signing, no .dmg | Set up in Phase 4 |
| **v1.0 target** | **September 26, 2026** | **4-week sprint** |

The project is further along than most 0.1.0 releases. The core architecture is sound, the feature set is substantial, and the remaining work is mostly polish, testing, and packaging. The biggest risk right now is the lack of version control — everything else is a matter of focused execution.
