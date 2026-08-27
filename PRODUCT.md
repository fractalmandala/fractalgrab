# FractalGrab — Markdown Notes Module (PRODUCT.md)

## Summary

Add a **Notes** workspace to FractalGrab where the user registers any local folder as a permanent vault, browses its folders and Markdown documents in a tree, and opens, edits, and saves Markdown files. Vault files and folders are fully manageable from the tree via a right-click context menu (rename, delete, cut, copy, paste). The editor offers a raw source view and an editable rich-text view with a toggle between them, undo/redo, autosave, and multiple open documents as tabs. Markdown files outside any vault can also be opened, edited, and saved back to their original location.

The workspace sits alongside the existing views (Moodboard / Cards / List / Timeline / Canvas) as a sixth **Notes** entry in the view switcher. While Notes is active, the sidebar shows the vault selector and the active vault's tree instead of the library collections tree, and the main area shows the editor with its tab bar.

## Goals

- A permanent, switchable set of local folders ("vaults") whose Markdown documents are always available in the app.
- A tree view of each vault's folders and `.md` files that tracks the real filesystem.
- Full file management inside the vault from the tree: rename, delete, cut, copy, paste (move), plus new notes and new folders.
- Editing any Markdown file on disk — in a vault or not — with autosave and explicit save-back to the same path.
- Two interchangeable editor views (raw source / rich text) that never lose content when toggling or editing, with working undo/redo.
- Multiple documents open at once in tabs.

## Non-goals

- No syncing, cloud, or collaboration.
- The app moves or copies files only through the user's explicit file operations (context menu actions) and document saves; vault registration itself never touches files.
- No Markdown linting, theme preview, or note export/PDF.
- Real filesystem vaults are unavailable in browser preview mode: the Notes workspace runs against an in-memory virtual vault seeded with demo documents, so the UI is exercisable without Tauri. Nothing persists between sessions, and existing library behavior is unchanged.

## Behavior

### Vaults

1. From the Notes workspace, the user can **Add vault…** to choose any local folder with the same folder picker used for the library folder. The folder is registered permanently: it survives app restarts until the user removes it.
2. Multiple vaults can be registered. Exactly one vault is active at a time; switching the active vault replaces the tree and notes workspace shown.
3. Adding, switching, or removing a vault never moves, copies, renames, or deletes any file or folder on disk. The only file changes that ever happen are the user's explicit context-menu operations and document saves. Removing a vault only unregisters it; its files stay untouched.
4. Removing the active vault leaves no vault active and shows the "no vault" empty state, which offers **Add vault…**.
5. If a vault's folder no longer exists or cannot be read, that vault shows a clear error state (e.g. "Folder missing") in the vault picker and the tree area; the user can still remove the vault, and no document from it can be opened until the folder is restored.

### Vault tree

6. The active vault renders as a tree of folders and Markdown documents, recursively: every subfolder at any depth appears as an expandable node, and every Markdown document (extension `.md` or `.markdown`, case-insensitive) appears as a leaf under its folder.
7. Non-Markdown files are not shown. Empty folders are shown. Entries whose names start with a dot are not shown. Entries that resolve outside the vault (e.g. via symlinks) are not shown.
8. Folders expand and collapse with a **single-branch rule**: expanding a folder collapses every other expanded folder that is not one of its ancestors. At any time only one chain of folders (root through the expanded folder) is open — a folder and its descendant folders can be expanded together, but sibling folders never stay expanded simultaneously. The current chain is remembered per vault while the app runs.
9. Clicking a document leaf opens it in a tab (see "Tabs"). The tree shows each document's name; the editor additionally shows its folder location within the vault.
10. The tree reflects the real filesystem: it refreshes on app start, when the vault is first added, when the window regains focus, and when the user triggers Refresh. Files or folders created, renamed, moved, or deleted outside the app appear or disappear on the next refresh.
11. While a vault scan is in progress the tree shows a loading indicator and the user can still switch views and vaults. A failed scan (permission denied, folder removed mid-scan) shows the error state from (5) rather than a partial or stale tree.

### Vault file management (context menu)

12. Right-clicking any entry in the vault tree opens a context menu with the applicable actions:
    - File: **Open**, **Rename**, **Cut**, **Copy**, **Delete**.
    - Folder: **Open** (expands it), **Rename**, **Cut**, **Copy**, **Paste**, **New note**, **New folder**, **Delete**.
    - Empty tree space: **Paste** (into the vault root), **New note**, **New folder**.
13. **Rename** edits the name inline. The new name must be non-empty, must not contain path separators, and must not collide with an existing entry in the same folder; any violation shows a message and keeps the old name. On success the tree updates, and an open tab referencing the file stays open with its displayed name and path updated.
14. **Cut** marks the entry (cutting a folder marks its entire subtree). The marked entry is visibly dimmed until pasted. The marking is cleared when it is pasted, when a new cut or copy is made, or when the app closes. Cut + Paste moves the entry.
15. **Copy** duplicates the entry (folders copy recursively). Copy + Paste duplicates into the target folder; if that folder already contains a same-named entry, the copy gets an auto-suffixed name ("name copy.md", then "name copy 2.md", and so on).
16. **Paste** always acts on the folder that was right-clicked (or the vault root for empty space). Pasting a cut entry into its own current folder is a no-op. Moving a folder into its own subtree is refused with a message.
17. Moving (cut + paste) into a folder that already contains a same-named entry is refused with a message, and the cut marking is preserved so the user can choose another destination.
18. **Delete** asks for confirmation, then removes the entry. Where the platform supports it, deletion moves the entry to the OS trash (recoverable); otherwise it is permanently removed. Deleting a folder removes its entire subtree.
19. Every file operation is followed by a tree refresh. An open tab whose file was renamed or moved updates its path and keeps its content; an open tab whose file was deleted shows a "file missing" state and can no longer save to that path.
20. File operations respect the filesystem: permission-denied, locked, or vanished sources produce a clear error, the operation fails cleanly, and the tree stays consistent. An operation that fails partway (e.g. copying a folder with an unreadable member) reports the error and leaves already-copied content in place.

### Opening documents and tabs

21. Documents open in tabs above the editor. The tab bar shows each open document's name, a dirty dot while it has unsaved changes, and a close button; many tabs scroll horizontally and the active tab is highlighted. A tab whose file is missing shows the "file missing" state from (19).
22. A document can be opened from the vault tree, from **Open file…** (a picker limited to Markdown files, any location on disk — the file is not added to any vault and the tab shows its full path), or by dropping a Markdown file onto the window while Notes is active (other drops keep existing capture behavior). Opening a document that already has a tab focuses that tab instead of opening a duplicate.
23. Closing a tab with unsaved changes prompts **Save / Discard / Cancel**; Cancel keeps the tab open.
24. On relaunch, the active vault and the previously open tabs are restored for documents that still exist; tabs whose files are gone open in the "file missing" state.

### Editor

25. The editor has two views, **Raw** and **Rich**, with a toggle control. Both views present the same in-memory document; toggling never loses content and keeps the caret in the same logical position as closely as possible.
26. Raw view is a plain-text editor showing the Markdown source verbatim in a monospace style, with **line numbers** and **Markdown syntax highlighting**, and standard text-editing behavior: selection, cut/copy/paste, undo/redo, a visible caret, and Tab/Shift-Tab to indent and outdent list items.
27. Rich view renders the Markdown: headings, paragraphs, bold, italic, strikethrough, inline code, code blocks, blockquotes, bullet and numbered lists, links, and images. Relative image paths resolve against the document's own folder, for both vault and external documents.
28. Rich view is directly editable: the user can type, delete, and select text; Enter starts a new paragraph; Backspace merges; and formatting from the toolbar (bold, italic, inline code, heading levels, bullet/numbered lists, blockquote, link) applies to the current selection or block and is reflected in the document.
29. The formatting toolbar is visible in Rich view only and reflects the formatting at the caret or selection (e.g. the bold button reads as active when the selection is bold).
30. The toolbar can insert an image: the user picks an image file, the file is copied into the document's own folder (auto-suffixed on name collision) and inserted as a relative-path Markdown image, rendered immediately in Rich view. Inserting requires the document to have a saved location — for a brand-new, unsaved document the app prompts the user to save it first.
31. **Round-trip invariant:** toggling Raw → Rich → Raw returns the identical source, unless the user edited the document in between. Edits made in Rich view serialize back to Markdown syntax (bold → `**…**`, heading → `# …`, list item → `- …`), and anything Rich view does not edit — tables, raw HTML, embedded content — is preserved byte-for-byte.
32. **Undo/redo** works in both views (Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z, or Cmd+Y). History is per document and shared across Raw and Rich: an edit made in either view is undoable from the other, and neither toggling views nor saving clears the history.
33. Links are clickable in Rich view (open in the default browser); images open as files.

### Saving

34. Every edit triggers an **autosave**: after a short quiet period (about one second) the document is written back, as UTF-8 text, to the exact path it was opened from — for external documents this is the original file outside any vault; the app never writes a copy into a vault instead. The dirty indicator clears once the autosave succeeds.
35. **Save** (button or Cmd/Ctrl+S) flushes immediately and is enabled while the document is dirty. Saving a clean document is a no-op.
36. If a document changed on disk since it was opened or last saved (edited by another app), autosave backs off rather than overwriting: the document stays dirty and a conflict indicator appears. The explicit Save then prompts **Overwrite / Reload / Cancel**. Overwrite writes the in-memory document; Reload discards local changes and re-reads the file; Cancel aborts the save and keeps the document dirty.
37. If an autosave or save fails (permission denied, file deleted or moved, disk error), the app shows a clear error, the document stays dirty, the change is retried on the next edit, and no data is lost.
38. A document that cannot be read as text (unreadable file, or not valid UTF-8) opens into an error state: the editor explains the problem and refuses to save over it. The tree still lists the file.
39. Pending autosaves flush when the window closes or the app quits. If a flush fails, the app warns before quitting so the user can save manually.

### New documents and folders (in vault)

40. **New note** and **New folder** (from the tree or its context menu) create the entry in the chosen folder: the user is prompted for a name (default "Untitled" / "New folder"), a duplicate or invalid name is rejected with a message, and a successful note creation opens the file in a new tab. Creating files or folders outside a vault is not supported.

### Keyboard, accessibility, focus

41. Cmd/Ctrl+S saves; Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z (or Cmd/Y) undo/redo; Cmd/Ctrl+B and Cmd/Ctrl+I toggle bold and italic in Rich view. Escape in the editor blurs the editor and cancels the current in-editor action rather than closing the document.
42. In the tree, Delete triggers delete (with its confirmation), F2 or Enter starts rename, and Cmd/Ctrl+C / X / V perform copy / cut / paste. The tree, toggle, toolbar, tabs, and editor are keyboard-accessible: tree nodes are focusable and navigable with arrow keys, tabs are reachable and closable from the keyboard, the toggle is a labelled control, and toolbar buttons carry accessible names and keyboard focus.
43. The existing global shortcuts (e.g. `/` search, `c` capture) do not fire while the editor or any input has focus. After using the toggle, toolbar, or tabs, focus returns to the editor so typing continues without an extra click.

### Frontmatter

44. A document whose first lines form a YAML frontmatter block — a first line `---`, a block of `key: value` lines, and a closing `---` line — uses the block's `title:` value as its tab name instead of the filename (a note whose frontmatter title changes picks up the new name when the document is next opened). Rich view hides the frontmatter block, and when frontmatter is present it also hides a redundant leading `#` heading. Frontmatter is preserved byte-for-byte in the source and is edited in Raw view.

### Browser preview

45. In browser preview mode the Notes workspace runs against an in-memory virtual vault (a `/Vault` seeded with demo documents): documents can be opened, edited, saved, and file-managed within the session, but vaults cannot be added or removed and nothing persists between sessions. No library behavior changes.
