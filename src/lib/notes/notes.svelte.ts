// Notes workspace store. Owns vaults, the active vault's tree, open document
// tabs (with autosave + conflict handling), the single-branch expansion chain,
// cut/copy/paste state, and undo/redo history shared across Raw and Rich views.
//
// State is exposed through the `notesUi` accessor object — module-level `$state`
// bindings must not be exported directly (Svelte compiler restriction).

import { backend, isTauri } from '../backend';
import { manifest, newId, persist, askInput, showMenu, toast, type MenuItem } from '../store.svelte';
import type { CutState, NoteTab, Vault, VaultNode } from '../types';
import { History } from './history';
import { parseFrontmatter } from './mdBlocks';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let vaults = $state<Vault[]>([]);
let activeVaultId = $state<string | null>(null);
let tree = $state<VaultNode | null>(null);
let treeLoading = $state(false);
let treeError = $state<string | null>(null);
let tabs = $state<NoteTab[]>([]);
let activeTabId = $state<string | null>(null);
let expanded = $state<Set<string>>(new Set());
let clipboard = $state<(CutState & { cut: boolean }) | null>(null);
let renamingPath = $state<string | null>(null);
let conflictTabId = $state<string | null>(null);
let closeTabId = $state<string | null>(null);
let notesReady = $state(false);

const expandedByVault = new Map<string, Set<string>>();
const historyByTab = new Map<string, History<string>>();
const historyArmedByTab = new Map<string, boolean>();
const autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
let closeFlushed = false;

function errMsg(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

function displayName(path: string): string {
	return path.split('/').filter(Boolean).pop() ?? path;
}

function activeVault(): Vault | null {
	return vaults.find((v) => v.id === activeVaultId) ?? null;
}

function isInVault(path: string): boolean {
	const v = activeVault();
	return !!v && (path === v.path || path.startsWith(v.path + '/'));
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export async function initNotes() {
	try {
		vaults = await backend.notesListVaults();
	} catch (e) {
		vaults = [];
		toast(`Could not load vaults: ${errMsg(e)}`, 'error');
	}
	const saved = manifest.settings.notes;
	if (saved.activeVaultId && vaults.some((v) => v.id === saved.activeVaultId)) {
		activeVaultId = saved.activeVaultId;
		expanded = expandedByVault.get(saved.activeVaultId) ?? new Set();
		await refreshTree();
	}
	// Build a lookup of saved per-tab view preferences
	const viewPrefs = new Map<string, 'raw' | 'rich'>();
	for (const entry of saved.openTabs ?? []) {
		viewPrefs.set(entry.path, entry.view);
	}
	for (const p of saved.openPaths ?? []) {
		await openPath(p, isInVault(p), viewPrefs.get(p));
	}
	window.addEventListener('focus', () => {
		if (activeVaultId) void refreshTree();
	});
	if (isTauri()) wireCloseFlush();
	notesReady = true;
}

function wireCloseFlush() {
	import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
		getCurrentWindow().onCloseRequested(async (event) => {
			if (closeFlushed) return;
			const dirty = tabs.filter((t) => t.dirty && !t.missing);
			if (!dirty.length) return;
			event.preventDefault();
			try {
				for (const tab of dirty) {
					const timer = autosaveTimers.get(tab.id);
					if (timer) clearTimeout(timer);
					const res = await backend.notesWrite(tab.path, tab.source, tab.mtimeMs);
					if (res.conflict) {
						tab.conflict = true;
						conflictTabId = tab.id;
						toast('A document changed on disk — resolve the conflict before quitting', 'error');
						return;
					}
					tab.mtimeMs = res.mtime_ms;
					tab.savedSource = tab.source;
					tab.dirty = false;
					tab.conflict = false;
				}
				closeFlushed = true;
				await getCurrentWindow().destroy();
			} catch (e) {
				toast(`Could not save changes before quitting: ${errMsg(e)}`, 'error');
			}
		});
	});
}

// ---------------------------------------------------------------------------
// Vaults
// ---------------------------------------------------------------------------

export async function addVault() {
	const path = await backend.chooseFolder();
	if (!path) return;
	try {
		const v = await backend.notesAddVault(path);
		vaults = [...vaults, v];
		await setActiveVault(v.id);
		toast(`Added vault "${v.name}"`, 'success');
	} catch (e) {
		toast(errMsg(e), 'error');
	}
}

export async function removeVault(id: string) {
	try {
		await backend.notesRemoveVault(id);
	} catch (e) {
		toast(errMsg(e), 'error');
		return;
	}
	vaults = vaults.filter((v) => v.id !== id);
	if (activeVaultId === id) {
		activeVaultId = null;
		tree = null;
		treeError = null;
		manifest.settings.notes.activeVaultId = null;
		persist();
	}
	toast('Vault removed', 'success');
}

export async function setActiveVault(id: string) {
	activeVaultId = id;
	manifest.settings.notes.activeVaultId = id;
	persist();
	expanded = expandedByVault.get(id) ?? new Set();
	await refreshTree();
	backend.notesSetActiveVault(id).catch(() => {});
}

export async function refreshTree() {
	const v = activeVault();
	if (!v) {
		tree = null;
		treeError = null;
		return;
	}
	treeLoading = true;
	treeError = null;
	try {
		tree = await backend.notesScan(v.path);
	} catch (e) {
		tree = null;
		treeError = errMsg(e);
	} finally {
		treeLoading = false;
	}
}

// ---------------------------------------------------------------------------
// Tree expansion (single-branch rule, PRODUCT 8)
// ---------------------------------------------------------------------------

export function toggleFolder(path: string) {
	if (expanded.has(path)) collapseFolder(path);
	else expandFolder(path);
}

export function expandFolder(path: string) {
	const v = activeVault();
	if (!v) return;
	const next = new Set<string>([v.path]);
	const rel = path.startsWith(v.path + '/') ? path.slice(v.path.length + 1) : null;
	if (rel) {
		let acc = v.path;
		for (const part of rel.split('/')) {
			acc += '/' + part;
			next.add(acc);
		}
	}
	expanded = next;
	expandedByVault.set(v.id, next);
}

export function collapseFolder(path: string) {
	const next = new Set<string>();
	for (const p of expanded) {
		if (p !== path && !p.startsWith(path + '/')) next.add(p);
	}
	expanded = next;
	const v = activeVault();
	if (v) expandedByVault.set(v.id, next);
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function persistOpenTabs() {
	manifest.settings.notes.openPaths = tabs.map((t) => t.path);
	manifest.settings.notes.openTabs = tabs.map((t) => ({ path: t.path, view: t.view }));
	persist();
}

function makeTab(path: string, inVault: boolean, source: string, mtimeMs: number, view: 'raw' | 'rich' = 'rich'): NoteTab {
	const fm = parseFrontmatter(source);
	return {
		id: newId('tab'),
		path,
		// Prefer the YAML frontmatter title over the filename.
		name: fm?.title || displayName(path),
		inVault,
		source,
		savedSource: source,
		mtimeMs,
		dirty: false,
		conflict: false,
		missing: false,
		readError: null,
		view
	};
}

export async function openPath(path: string, inVault: boolean, view?: 'raw' | 'rich') {
	const existing = tabs.find((t) => t.path === path);
	if (existing) {
		activeTabId = existing.id;
		return;
	}
	let tab: NoteTab;
	try {
		const res = await backend.notesRead(path);
		tab = makeTab(path, inVault, res.text, res.mtime_ms, view);
	} catch (e) {
		tab = makeTab(path, inVault, '', 0, view);
		tab.missing = true;
		tab.readError = errMsg(e);
	}
	tabs.push(tab);
	activeTabId = tab.id;
	historyFor(tab.id).reset(tab.source);
	persistOpenTabs();
}

export async function openExternal() {
	const path = await backend.chooseMarkdownFile();
	if (!path) return;
	await openPath(path, false);
}

export async function openDropped(path: string) {
	if (!/\.(md|markdown)$/i.test(path)) return;
	await openPath(path, isInVault(path));
}

export function activateTab(id: string) {
	activeTabId = id;
}

export function requestCloseTab(id: string) {
	const tab = tabs.find((t) => t.id === id);
	if (!tab) return;
	if (tab.dirty && !tab.missing) {
		closeTabId = id;
		return;
	}
	doCloseTab(id);
}

function doCloseTab(id: string) {
	const idx = tabs.findIndex((t) => t.id === id);
	if (idx < 0) return;
	const wasActive = activeTabId === id;
	tabs.splice(idx, 1);
	historyByTab.delete(id);
	historyArmedByTab.delete(id);
	const timer = autosaveTimers.get(id);
	if (timer) clearTimeout(timer);
	autosaveTimers.delete(id);
	if (wasActive) {
		activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null;
	}
	if (closeTabId === id) closeTabId = null;
	if (conflictTabId === id) conflictTabId = null;
	persistOpenTabs();
}

export function resolveCloseTab(tabId: string, choice: 'save' | 'discard' | 'cancel') {
	if (choice === 'cancel') {
		closeTabId = null;
		return;
	}
	if (choice === 'discard') {
		doCloseTab(tabId);
		return;
	}
	// save
	void (async () => {
		const ok = await flushTab(tabId, 'manual');
		if (ok) doCloseTab(tabId);
	})();
}

// ---------------------------------------------------------------------------
// Editing, autosave, undo/redo
// ---------------------------------------------------------------------------

export function setSource(id: string, source: string) {
	const tab = tabs.find((t) => t.id === id);
	if (!tab || tab.source === source) return;
	// History stores states, with the index at the current state. The first
	// edit of a batch pushes the NEW state so undo returns to the previous
	// one; further edits in the same batch coalesce into it.
	if (!historyArmedByTab.get(id)) {
		historyFor(id).push(source);
		historyArmedByTab.set(id, true);
		setTimeout(() => historyArmedByTab.set(id, false), 600);
	}
	tab.source = source;
	tab.dirty = true;
	tab.conflict = false;
	scheduleAutosave(tab);
}

export function setTabView(id: string, view: 'raw' | 'rich') {
	const tab = tabs.find((t) => t.id === id);
	if (tab) tab.view = view;
}

export function undo(id: string) {
	const tab = tabs.find((t) => t.id === id);
	if (!tab) return;
	const prev = historyFor(id).undo();
	if (prev === null) return;
	historyArmedByTab.set(id, false);
	tab.source = prev;
	tab.dirty = tab.source !== tab.savedSource;
	tab.conflict = false;
	scheduleAutosave(tab);
}

export function redo(id: string) {
	const tab = tabs.find((t) => t.id === id);
	if (!tab) return;
	const next = historyFor(id).redo();
	if (next === null) return;
	historyArmedByTab.set(id, false);
	tab.source = next;
	tab.dirty = tab.source !== tab.savedSource;
	tab.conflict = false;
	scheduleAutosave(tab);
}

function scheduleAutosave(tab: NoteTab) {
	const t = autosaveTimers.get(tab.id);
	if (t) clearTimeout(t);
	autosaveTimers.set(
		tab.id,
		setTimeout(() => {
			autosaveTimers.delete(tab.id);
			void flushTab(tab.id, 'auto');
		}, 1000)
	);
}

/** Write the tab's source back to disk. Returns true when the save succeeded. */
export async function flushTab(id: string, mode: 'auto' | 'manual'): Promise<boolean> {
	const tab = tabs.find((t) => t.id === id);
	if (!tab) return false;
	if (!tab.dirty) return true;
	if (tab.missing) {
		toast(`"${tab.name}" is missing on disk — cannot save`, 'error');
		return false;
	}
	const timer = autosaveTimers.get(id);
	if (timer) clearTimeout(timer);
	autosaveTimers.delete(id);
	try {
		const res = await backend.notesWrite(tab.path, tab.source, tab.mtimeMs);
		if (res.conflict) {
			tab.conflict = true;
			tab.mtimeMs = res.mtime_ms;
			if (mode === 'manual') conflictTabId = id;
			return false;
		}
		tab.mtimeMs = res.mtime_ms;
		tab.savedSource = tab.source;
		tab.dirty = false;
		tab.conflict = false;
		return true;
	} catch (e) {
		toast(`Could not save "${tab.name}": ${errMsg(e)}`, 'error');
		return false;
	}
}

export function resolveConflict(tabId: string, choice: 'overwrite' | 'reload' | 'cancel') {
	conflictTabId = null;
	const tab = tabs.find((t) => t.id === tabId);
	if (!tab || choice === 'cancel') return;
	void (async () => {
		if (choice === 'overwrite') {
			try {
				const res = await backend.notesWrite(tab.path, tab.source, null);
				tab.mtimeMs = res.mtime_ms;
				tab.savedSource = tab.source;
				tab.dirty = false;
				tab.conflict = false;
				toast(`Saved "${tab.name}"`, 'success');
			} catch (e) {
				toast(`Could not save: ${errMsg(e)}`, 'error');
			}
		} else {
			try {
				const res = await backend.notesRead(tab.path);
				tab.source = res.text;
				tab.savedSource = res.text;
				tab.mtimeMs = res.mtime_ms;
				tab.dirty = false;
				tab.conflict = false;
				tab.missing = false;
				tab.readError = null;
				historyFor(tab.id).reset(res.text);
				toast('Reloaded from disk — local changes discarded', 'info');
			} catch (e) {
				toast(`Could not reload: ${errMsg(e)}`, 'error');
			}
		}
	})();
}

function historyFor(id: string): History<string> {
	let h = historyByTab.get(id);
	if (!h) {
		h = new History<string>();
		historyByTab.set(id, h);
	}
	return h;
}

// ---------------------------------------------------------------------------
// Vault file operations (context menu)
// ---------------------------------------------------------------------------

/** Update open tabs after a rename/move (newPath) or delete (null). */
function reconcileTabs(oldPath: string, newPath: string | null) {
	for (const tab of tabs) {
		if (tab.path === oldPath || tab.path.startsWith(oldPath + '/')) {
			if (newPath === null) {
				tab.missing = true;
				tab.readError = 'This file was deleted';
			} else {
				tab.path = tab.path.replace(oldPath, newPath);
				tab.name = parseFrontmatter(tab.source)?.title || displayName(tab.path);
				tab.inVault = isInVault(tab.path);
			}
		}
	}
	persistOpenTabs();
}

export async function renameEntry(path: string, newName: string): Promise<boolean> {
	const name = newName.trim();
	if (!name) return false;
	try {
		const out = await backend.notesRename(path, name);
		reconcileTabs(path, out);
		renamingPath = null;
		await refreshTree();
		return true;
	} catch (e) {
		toast(errMsg(e), 'error');
		return false;
	}
}

export function cutEntry(path: string, isDir: boolean) {
	clipboard = { path, isDir, cut: true };
}

export function copyEntry(path: string, isDir: boolean) {
	clipboard = { path, isDir, cut: false };
}

export async function pasteInto(dirPath: string) {
	const c = clipboard;
	if (!c) return;
	if (c.cut) {
		if (dirPath === c.path || dirPath.startsWith(c.path + '/')) {
			toast('Cannot move an item into itself', 'error');
			return;
		}
		// PRODUCT 16: pasting a cut entry into its own current folder is a
		// no-op — nothing moves, the cut marking stays.
		const ownDir = c.path.slice(0, c.path.lastIndexOf('/'));
		if (dirPath === ownDir) return;
	}
	try {
		const out = c.cut ? await backend.notesMove(c.path, dirPath) : await backend.notesCopy(c.path, dirPath);
		if (c.cut) reconcileTabs(c.path, out);
		clipboard = null;
		await refreshTree();
		toast(c.cut ? 'Moved' : 'Copied', 'success');
	} catch (e) {
		toast(errMsg(e), 'error');
	}
}

export async function deleteEntry(path: string, isDir: boolean) {
	const name = displayName(path);
	const msg = isDir
		? `Delete folder "${name}"? Its entire contents will be moved to the Trash.`
		: `Delete "${name}"? It will be moved to the Trash.`;
	if (!confirm(msg)) return;
	try {
		await backend.notesDelete(path);
		reconcileTabs(path, null);
		await refreshTree();
		toast('Deleted', 'success');
	} catch (e) {
		toast(errMsg(e), 'error');
	}
}

export function createInFolder(dir: string, kind: 'note' | 'folder') {
	const defaultName = kind === 'note' ? 'Untitled.md' : 'New folder';
	askInput(kind === 'note' ? 'New note' : 'New folder', 'Name', defaultName, (name) => {
		const n = name.trim();
		if (!n) return;
		void (async () => {
			try {
				const out = await backend.notesCreate(dir, kind, n);
				await refreshTree();
				if (kind === 'note') await openPath(out, isInVault(out));
			} catch (e) {
				toast(errMsg(e), 'error');
			}
		})();
	});
}

export function setRenamingPath(path: string | null) {
	renamingPath = path;
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

function pasteItem(dirPath: string | null): MenuItem {
	const enabled = !!clipboard;
	return {
		label: 'Paste',
		icon: 'clipboard',
		disabled: !enabled,
		action: () => {
			if (dirPath) void pasteInto(dirPath);
		}
	};
}

export function openNotesContextMenu(x: number, y: number, path: string, isDir: boolean, isRoot: boolean) {
	const items: MenuItem[] = [];
	if (isRoot) {
		items.push(pasteItem(path));
		items.push({ label: 'New note', icon: 'file-plus', action: () => createInFolder(path, 'note') });
		items.push({ label: 'New folder', icon: 'folder-plus', action: () => createInFolder(path, 'folder') });
		items.push({ separator: true });
		items.push({ label: 'Refresh', icon: 'refresh', action: () => void refreshTree() });
	} else if (isDir) {
		items.push({
			label: 'Open',
			icon: 'folder-open',
			action: () => toggleFolder(path)
		});
		items.push({ separator: true });
		items.push({
			label: 'Rename…',
			icon: 'pencil',
			action: () => setRenamingPath(path)
		});
		items.push({ label: 'Cut', icon: 'scissors', action: () => cutEntry(path, true) });
		items.push({ label: 'Copy', icon: 'copy', action: () => copyEntry(path, true) });
		items.push(pasteItem(path));
		items.push({ separator: true });
		items.push({ label: 'New note', icon: 'file-plus', action: () => createInFolder(path, 'note') });
		items.push({ label: 'New folder', icon: 'folder-plus', action: () => createInFolder(path, 'folder') });
		items.push({ separator: true });
		items.push({ label: 'Delete', icon: 'trash-2', danger: true, action: () => void deleteEntry(path, true) });
	} else {
		items.push({ label: 'Open', icon: 'file-text', action: () => void openPath(path, isInVault(path)) });
		items.push({ separator: true });
		items.push({ label: 'Rename…', icon: 'pencil', action: () => setRenamingPath(path) });
		items.push({ label: 'Cut', icon: 'scissors', action: () => cutEntry(path, false) });
		items.push({ label: 'Copy', icon: 'copy', action: () => copyEntry(path, false) });
		items.push({ separator: true });
		items.push({ label: 'Delete', icon: 'trash-2', danger: true, action: () => void deleteEntry(path, false) });
	}
	showMenu(x, y, items);
}

// ---------------------------------------------------------------------------
// ui: read/write bridge (runes can't export mutable bindings)
// ---------------------------------------------------------------------------

export const notesUi = {
	get vaults() {
		return vaults;
	},
	get activeVaultId() {
		return activeVaultId;
	},
	get activeVault() {
		return activeVault();
	},
	get tree() {
		return tree;
	},
	get treeLoading() {
		return treeLoading;
	},
	get treeError() {
		return treeError;
	},
	get tabs() {
		return tabs;
	},
	get activeTabId() {
		return activeTabId;
	},
	get activeTab() {
		return tabs.find((t) => t.id === activeTabId) ?? null;
	},
	get expanded() {
		return expanded;
	},
	get clipboard() {
		return clipboard;
	},
	set clipboard(v) {
		clipboard = v;
	},
	get renamingPath() {
		return renamingPath;
	},
	set renamingPath(v) {
		renamingPath = v;
	},
	get conflictTabId() {
		return conflictTabId;
	},
	get closeTabId() {
		return closeTabId;
	},
	get notesReady() {
		return notesReady;
	}
};
