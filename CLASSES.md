# FractalGrab — Class Reference

FractalGrab styles everything through the **fractals-styler** system
(`src/lib/styles/`). There is no bespoke `app.sass` anymore:

- **Tokens** (`_tokens.sass`) — colours, fluid type/space scales, radii, shadows,
  z-layers. Change a value here for global effects.
- **Utilities & primitives** (`_typography.sass`, `_primitives.sass`) — one-job
  classes like `text-xs`, `text-muted`, `row`, `box`, `grow`, `border-right`,
  `badge`, `kbd`, `card`, `divider`.
- **Compositions** (`_compositions.sass`) — `appshell`, `appheader`, `auto-grid`,
  `stack`, `cluster`, `reel`, … macro arrangement only.
- **Buttons** (`_buttonslinks.sass`) — the `.button` block with `data-variant`
  (`primary` / `quiet` / `danger` / `icon`) and `data-size="sm"`.
- **Project blocks** (`_blocks.sass`) — FractalGrab's own component classes, flat
  names, token values only, state via `data-*` attributes. This is where the
  app-specific pieces live (cards, canvas, dial, toasts, modals…).
- **JIT escape hatch** (`virtual:fractals-styler.css`) — numeric utilities such as
  `gap8`, `gap4`; promote any recurring value into a token/class.

To restyle something: change the token, utility, or block in the partial that owns
it. If you add a class, keep the naming flat (`layer role variant breakpoint`) and
add it to the right partial — a new component context goes in `_blocks.sass`.

---

## App shell (`+page.svelte`, `Header.svelte`)

| Class | Where | What it is |
|---|---|---|
| `.appshell` | root of the whole app | full-height flex column; header + body |
| `.appheader` (+ `.row ycenter xbetween`) | top bar | sticky header, `--header-height` |
| `.row grow min-h-0` | below header | flex row: sidebar + main + detail |
| `.box shrink-0 min-h-0 bg-surface border-right` | aside | 250px left column (width inline) |
| `.box shrink-0 min-h-0 bg-surface border-left` | detail | 340px right column (width inline) |
| `.logo`, `.logomotif`, `.logotype` | header | brand block + image sizes |
| `.search-input` | header | pill search wrapper (`.row gap8`) |
| `.brand-mark` | loading screen | conic-gradient fractal logo square |

## Sidebar / collections (`CollectionTree.svelte`, `TreeItem.svelte`)

| Class | Where | What it is |
|---|---|---|
| `.sidebar-header` | sidebar | "LIBRARY" / "COLLECTIONS" label row |
| `.sidebar-scroll` | sidebar | scrollable tree area (plus `.scroll`) |
| `.nav-item` | tree rows + All/Favourites/Recent | sidebar row; `[data-state='active']` highlight |
| `.nav-item-count` | row | item count, pushed right |
| `.grow truncate` | row | flexible ellipsizing title |

## Main content & views (`+page.svelte`, `Views.svelte`)

| Class | Where | What it is |
|---|---|---|
| `.box grow min-w-0` | main column | flex column of toolbar + content |
| `.toolbar` | above grid | title, view switch, batch bar |
| `.view-switch` / `.view-btn` | toolbar | segmented control; `[data-state='active']` |
| `.content` | grid area | scrollable container for items |
| `.auto-grid` | Cards / Moodboard grid | intrinsic auto-fit grid; `--auto-grid-min` inline (190 / 240px) |
| `.list` / `.list-row` | List view | vertical stack of rows; `[data-state='selected']` |
| `.timeline-group` / `.timeline-label` | Timeline view | time-bucket groups |

## Buttons & controls

| Class | Where | What it is |
|---|---|---|
| `.button` | everywhere | base button (`_buttonslinks.sass`) |
| `data-variant="primary"` | Capture / confirm | theme-filled button |
| `data-variant="quiet"` | secondary actions | transparent, muted text |
| `data-variant="danger"` | destructive actions | red-tinted |
| `data-variant="icon"` | icon-only buttons | padded icon button |
| `data-size="sm"` | small buttons | smaller padding + `--text-xs` |
| `.switch` | settings toggles | pill toggle; `[data-state='on']` = enabled |
| `.kbd` | shortcuts | keyboard key hint |
| `.badge` (+ `.border`, `.tag`) | tags / chips | pill chip; `.tag` styles its remove `button` |
| `.color-dot` | cards, picker, detail | colour swatch (hover to copy) |

## Cards (`ItemCard.svelte`)

| Class | Where | What it is |
|---|---|---|
| `.item-card` | every item card | card shell; `[data-state='selected']` ring |
| `.item-card-thumb` | card top | 4:3 image area (+ `.backdrop` blur layer) |
| `.item-card-body` | card bottom | title + meta stack |
| `.item-card-title` | card body | 2-line clamped title (`.line-clamp-2`) |
| `.item-card-colors` | card body | colour dot row (absolute, inline) |
| `.fav` | cards, detail preview | favourite star badge (top-right) |
| `.monogram` | cards without image | big letter/emoji placeholder |

## Item detail panel (`ItemDetail.svelte`)

| Class | Where | What it is |
|---|---|---|
| `.detail-preview` | panel top | 16:10 image preview |
| `.detail-body` | panel content | scrollable field stack (+ `.scroll`) |
| `.field` | any labelled group | label + control column (`label` = uppercase caption) |
| `.chips` | tags / colours / collections | wrap row of chips |

## Panels & dialogs (Capture, Settings, ask-modal)

| Class | Where | What it is |
|---|---|---|
| `.overlay` | behind every modal | full-screen dim + blur |
| `.panel` | the modal card | rounded surface, width `min(620px, 92vw)` |
| `.panel-header` / `.panel-body` | modal | title row + scrollable padded column |
| `.tabs` / `.tab` | Capture panel | tab bar; `[data-state='active']` underline |
| `.dropzone` | Capture drop areas | dashed drop target; `[data-state='drag']` highlight |

## Right-click context menu (`ContextMenu.svelte` — scoped `<style>`)

| Class | Where | What it is |
|---|---|---|
| `.menu` | the floating menu | min-width 220px surface, positioned at cursor |
| `.menu-item` | each row | item/icon/label/submenu arrow |
| `.menu-item.danger` | destructive rows | red text |
| `.menu-item:disabled` | unavailable rows | dimmed |
| `.menu-sep` | between groups | 1px divider |

The menu reuses `.overlay`, `.panel`, `.panel-header`, `.panel-body`, `.button`,
`.row` for its ask-modal.

## Drag dial (`DragDial.svelte`)

| Class | Where | What it is |
|---|---|---|
| `.dial` | 1px anchor at cursor | fixed, pointer-events none |
| `.dial-sector` | each collection sector | pill orbiting the cursor; `[data-state='hot']` = highlight |
| `.dial-center` | middle | Cancel button |

Sectors carry `data-dial-col` (the id the drop logic reads) and per-sector
`--a` / `--r` CSS vars (angle / radius).

## Canvas (`CanvasView.svelte`)

| Class | Where | What it is |
|---|---|---|
| `.canvas` | full content area | pan/zoom surface (`.dragging` while panning) |
| `.canvas-inner` | transformed layer | translate + scale container |
| `.canvas-node` | each item node | positioned card (`.dragging` while moved) |
| `.canvas-node-label` | node | title bar |
| `.canvas-hint` | bottom centre | controls hint pill |

## Toasts (`Toasts.svelte`)

| Class | Where | What it is |
|---|---|---|
| `.toasts` | fixed bottom-right | toast stack |
| `.toast` | each toast | pill; `[data-kind='success'|'error'|'info']` edge colour |

## Notes workspace (`src/lib/components/notes/*` — scoped `<style>`)

The Notes workspace swaps the library sidebar and main area for a vault picker,
vault tree, document tabs and a Markdown editor (Raw = CodeMirror, Rich =
structured contentEditable). All notes chrome is component-scoped (no
`_blocks.sass` entries yet):

| Class | Where | What it is |
|---|---|---|
| `.vault-row` | `VaultTreeItem` / `VaultTree` | tree row; `[data-state='cut']` dims a cut entry; carries `data-vault-path` + `data-vault-dir` |
| `.tabbar` | `EditorTabs` | horizontal document tab strip (scrolls, no visible scrollbar) |
| `.tab` | `EditorTabs` | document tab; `[data-state='active']` theme underline, dirty `.dot`, conflict `.dot.conflict` |
| `.tab-close` | `EditorTabs` | per-tab close button |
| `.raw-host` | `RawEditor` | CodeMirror mount; token colours via `.cm-editor .tok-*` |
| `.rich-host` | `RichEditor` | editable rendered view; block children are `.md-block` elements |
| `.md-block` | `RichEditor` | one editable Markdown block (h1–h6 / p / ul / ol / blockquote) |
| `.md-blank` | `RichEditor` | blank-line block (min-height keeps it clickable) |
| `.md-readonly` | `RichEditor` | read-only block (code, tables, raw HTML, frontmatter) |
| `.tb-btn` / `.tb-sep` | `EditorToolbar` | formatting toolbar buttons; `[data-active='true']` reflects state at caret |

Rich-view notes: YAML frontmatter and a leading `#` h1 (when frontmatter is
present) are hidden from the rendered view but preserved verbatim in the
source — the frontmatter `title:` drives the tab name.

## Keyboard shortcuts modal (`KeyboardShortcuts.svelte` — scoped `<style>`)

| Class | Where | What it is |
|---|---|---|
| `.overlay` | backdrop | full-screen dim (reuses modal overlay) |
| `.panel` | modal card | rounded surface |
| `.panel-header` | modal | title row with close button |
| `.shortcut-section` | modal body | one group of shortcuts |
| `.shortcut-row` | section | `kbd` + description pair |
| `.shortcut-keys` | row | monospace key hint badge |
| `.shortcut-desc` | row | shortcut description text |

## Onboarding (`Onboarding.svelte` — scoped `<style>`)

| Class | Where | What it is |
|---|---|---|
| `.onboarding-overlay` | backdrop | full-screen dim with fade-in |
| `.onboarding-panel` | modal card | rounded surface with slide-up animation |
| `.onboarding-step` | content | centred step layout (icon, title, desc, buttons) |
| `.onboarding-icon` | step | large themed icon container |
| `.onboarding-btn` | step actions | primary (theme) or secondary (ghost) button |
| `.onboarding-features` | welcome step | stacked feature highlights |
| `.shortcuts-grid` | shortcuts step | 2-column grid of shortcut hints |

## Skeleton loading (`Skeleton.svelte` — scoped `<style>`)

| Class | Where | What it is |
|---|---|---|
| `.skeleton-grid` | container | auto-fit grid matching item card layout |
| `.skeleton-item` | each placeholder | card shell with fade-in animation |
| `.skel` | inner shapes | shimmer-animated gradient bar |
| `.skel-image` | card variant | tall image placeholder |
| `.skel-title` / `.skel-text` | card variant | text line placeholders |

## Sidebar resize handle (compositions)

| Class | Where | What it is |
|---|---|---|
| `.sidebar-resize` | sidebar edge | 6px drag handle, theme highlight on hover |
| `.loading-screen` | app shell | centred loading state with fade-in |

## Empty / misc states

| Class | Where | What it is |
|---|---|---|
| `.empty` | empty grids, loading screen | centred placeholder block |
| `.scroll` | sidebar, detail body | thin scrollbar utility |

## Utility notes

- State and variants are expressed with `data-*` attributes (`data-state`,
  `data-variant`, `data-size`, `data-kind`) — never `--modifier` classes.
- JIT numeric utilities (`gap8`, `gap4`) come from `virtual:fractals-styler.css`;
  the scanner picks them up from the markup automatically.
- Animations: `toast-in` (toasts), `pulse` (loading mark), `fadeIn`,
  `slideUp`, `shimmer`, `skeletonFade` — defined in `_blocks.sass` and
  component scoped styles.
