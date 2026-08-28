import { backend, cacheLibraryDir, isTauri } from './backend';
import { defaultManifest, isSeeded, writeSeedToStorage } from './mock';
import { colorDistance, extractPalette } from './color';
import { ocrImage } from './ocr';	import { aiConfigured, aiTagItem, aiRename, aiArtPrompt, aiSemanticSearch, migrateAi } from './ai';
import type { BackupMeta, CanvasLayout, Collection, FileMeta, Item, Manifest, ViewMode } from './types';

let uid = 0;
export function newId(prefix = 'id'): string {
	return `${prefix}-${Date.now().toString(36)}-${(uid++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function sanitizeFilename(name: string): string {
	const cleaned = name
		.replace(/[\\/:*?"<>|]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 120);
	return cleaned || 'untitled';
}

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

export function guessType(mime: string, filename: string): Item['type'] {
	const f = filename.toLowerCase();
	if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|avif|svg|bmp|heic)$/.test(f)) return 'image';
	if (mime.startsWith('video/') || /\.(mp4|mov|webm|mkv|m4v)$/.test(f)) return 'video';
	if (f.endsWith('.md') || f.endsWith('.txt')) return 'note';
	if (f.endsWith('.webloc') || f.endsWith('.html')) return 'link';
	return 'file';
}

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

export const manifest = $state<Manifest>(defaultManifest());
let libraryDir = $state('');
let loading = $state(true);
let busy = $state(false);

let selectedCollectionId = $state<string | null>(null); // null = All
let selectedItemId = $state<string | null>(null);
let searchQuery = $state('');
let activeColorSearch = $state<string | null>(null);
export const batchSelection = $state<Set<string>>(new Set());

export const toasts = $state<{ id: number; msg: string; kind: 'info' | 'success' | 'error' }[]>([]);
let captureOpen = $state(false);
let settingsOpen = $state(false);
let importOpen = $state(false);

let dialOpen = $state(false);
let dialX = $state(0);
let dialY = $state(0);
let dialMode = $state<'capture' | 'file'>('capture');
let pendingCapture = $state<{ files?: File[]; url?: string; text?: string; paths?: string[] } | null>(null);

let missingIds = $state<Set<string>>(new Set());
let untrackedFiles = $state<FileMeta[]>([]);
let backupMeta = $state<BackupMeta | null>(null);
let searchResultIds = $state<Set<string>>(new Set());

let toastId = 0;
export function toast(msg: string, kind: 'info' | 'success' | 'error' = 'info') {
	const id = ++toastId;
	toasts.push({ id, msg, kind });
	setTimeout(() => {
		const i = toasts.findIndex((t) => t.id === id);
		if (i >= 0) toasts.splice(i, 1);
	}, 3800);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

let persistTimer: ReturnType<typeof setTimeout> | undefined;
export function persist() {
	clearTimeout(persistTimer);
	persistTimer = setTimeout(async () => {
		try {
			await backend.writeManifest(JSON.stringify(manifest));
		} catch (e) {
			console.error('persist failed', e);
		}
	}, 350);
}

export function applyManifest(m: Manifest) {
	manifest.version = m.version ?? 1;
	manifest.settings = { ...defaultManifest().settings, ...m.settings };
	manifest.settings.ai = migrateAi(manifest.settings.ai as any);
	manifest.collections = m.collections ?? [];
	manifest.items = m.items ?? [];
	manifest.canvas = m.canvas ?? {};
}

export async function load() {
	loading = true;
	try {
		const dir = await backend.getLibraryDir();
		libraryDir = dir;
		cacheLibraryDir(dir);

		let raw: string | null = null;
		try {
			raw = await backend.readManifest();
		} catch {
			raw = null;
		}

		if (raw) {
			try {
				applyManifest(JSON.parse(raw));
			} catch {
				applyManifest(defaultManifest());
			}
		} else if (isTauri()) {
			applyManifest(defaultManifest());
			await persistNow();
		} else {
			if (isSeeded()) writeSeedToStorage();
			applyManifest(JSON.parse(localStorage.getItem('fractalgrab:manifest') ?? '{}'));
		}

		if (isTauri()) {
			try {
				await backend.setExtensionServer(manifest.settings.extensionServer);
			} catch {
				/* fine */
			}
			backupMeta = await backend.getBackupMeta().catch(() => null);
			await rescan();
		}
	} catch (e) {
		console.error('load failed', e);
	} finally {
		loading = false;
	}
}

export async function persistNow() {
	await backend.writeManifest(JSON.stringify(manifest));
}

export async function rescan() {
	if (!isTauri()) return;
	try {
		const files = await backend.listLibrary();
		const byName = new Map(files.map((f) => [f.name, f]));
		const missing = manifest.items.filter((i) => !byName.has(i.filename));
		missingIds = new Set(missing.map((i) => i.id));
		const known = new Set(manifest.items.map((i) => i.filename));
		// Files the app itself manages alongside items (the manifest and each
		// item's favicon / og-image sidecars) are never "untracked" items.
		const sidecars = new Set<string>();
		for (const i of manifest.items) {
			if (i.faviconFile) sidecars.add(i.faviconFile);
			if (i.imageFile) sidecars.add(i.imageFile);
		}
		const plausible = (name: string) =>
			!name.startsWith('.') &&
			/\.(webloc|html?|md|txt|jpe?g|png|gif|webp|avif|svg|bmp|heic|mp4|mov|webm|mkv|m4v|pdf|json)$/i.test(name);
		untrackedFiles = files.filter(
			(f) =>
				!known.has(f.name) &&
				f.name !== 'fractalgrab.json' &&
				!sidecars.has(f.name) &&
				plausible(f.name)
		);
	} catch {
		/* fine */
	}
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

export function collections() {
	return manifest.collections;
}

export function selectedItem() {
	return manifest.items.find((i) => i.id === selectedItemId) ?? null;
}

export function collectionName(id: string | null): string {
	if (!id) return 'All items';
	if (id === '__fav__') return 'Favourites';
	if (id === '__recent__') return 'Recent';
	return manifest.collections.find((c) => c.id === id)?.name ?? 'Unknown';
}

export function filteredItems(): Item[] {
	let items = manifest.items;

	const col = selectedCollectionId;
	if (col === '__fav__') items = items.filter((i) => i.favourite);
	else if (col === '__recent__') {
		const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
		items = items.filter((i) => i.createdAt >= cutoff);
	} else if (col) {
		items = items.filter((i) => i.collectionIds.includes(col));
	}

	const q = searchQuery.trim().toLowerCase();
	if (q) {
		items = items.filter((i) => {
			const hay = [i.title, i.url, i.note, i.tags.join(' '), (i.aiTags ?? []).join(' '), i.ocrText]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();
			return hay.includes(q);
		});
	}

	if (activeColorSearch) {
		const target = activeColorSearch;
		items = items.filter((i) =>
			(i.colors ?? []).some((c) => colorDistance(c, target) < 70)
		);
	}

	if (searchResultIds.size) {
		items = items.filter((i) => searchResultIds.has(i.id));
	}

	return [...items].sort((a, b) => b.createdAt - a.createdAt);
}

export function itemCount() {
	return manifest.items.length;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export function addItem(partial: Partial<Item> & Pick<Item, 'type' | 'title' | 'filename'>): Item {
	const nowT = Date.now();
	const item: Item = {
		id: partial.id ?? newId('item'),
		type: partial.type,
		title: partial.title,
		filename: partial.filename,
		url: partial.url ?? null,
		createdAt: partial.createdAt ?? nowT,
		updatedAt: partial.updatedAt ?? nowT,
		favourite: partial.favourite ?? false,
		collectionIds: partial.collectionIds ?? [],
		tags: partial.tags ?? [],
		note: partial.note ?? null,
		colors: partial.colors ?? [],
		ocrText: partial.ocrText ?? null,
		aiTags: partial.aiTags ?? [],
		faviconFile: partial.faviconFile ?? null,
		imageFile: partial.imageFile ?? null,
		width: partial.width ?? null,
		height: partial.height ?? null
	};
	manifest.items.unshift(item);
	persist();
	return item;
}

export function updateItem(id: string, patch: Partial<Item>) {
	const item = manifest.items.find((i) => i.id === id);
	if (!item) return;
	Object.assign(item, patch, { updatedAt: Date.now() });
	persist();
}

export function deleteItems(ids: string[]) {
	for (const id of ids) {
		const item = manifest.items.find((i) => i.id === id);
		if (!item) continue;
		if (isTauri()) {
			backend.deleteFile(item.filename).catch(() => {});
		}
		if (item.id === selectedItemId) selectedItemId = null;
		batchSelection.delete(id);
	}
	manifest.items = manifest.items.filter((i) => !ids.includes(i.id));
	persist();
	toast(`Deleted ${ids.length} item${ids.length > 1 ? 's' : ''}`, 'success');
}

export function setFavourite(id: string, v: boolean) {
	updateItem(id, { favourite: v });
}

export function toggleTag(id: string, tag: string) {
	const item = manifest.items.find((i) => i.id === id);
	if (!item) return;
	if (item.tags.includes(tag)) item.tags = item.tags.filter((t) => t !== tag);
	else item.tags = [...item.tags, tag];
	persist();
}

export function setNote(id: string, note: string) {
	updateItem(id, { note });
}

export function moveToCollection(id: string, collectionId: string, on: boolean) {
	const item = manifest.items.find((i) => i.id === id);
	if (!item) return;
	if (on) {
		if (!item.collectionIds.includes(collectionId)) item.collectionIds = [...item.collectionIds, collectionId];
	} else {
		item.collectionIds = item.collectionIds.filter((c) => c !== collectionId);
	}
	persist();
}

export async function renameTitle(id: string, title: string, renameFile = true) {
	const item = manifest.items.find((i) => i.id === id);
	if (!item) return;
	const clean = title.trim();
	if (!clean) return;
	const ext = item.filename.slice(item.filename.lastIndexOf('.')) || '';
	const wantsRename = renameFile && /\.(webloc|md|txt|html)$/i.test(ext);
	if (wantsRename) {
		const newName = `${sanitizeFilename(clean)}${ext}`;
		if (newName !== item.filename) {
			try {
				const renamed = await backend.renameFile(item.filename, newName);
				item.filename = renamed;
			} catch {
				/* keep old name */
			}
		}
	}
	item.title = clean;
	item.updatedAt = Date.now();
	persist();
}

export async function removeItemFromLibrary(id: string) {
	await deleteItems([id]);
}

export async function importUntracked(name: string) {
	// Re-save the file reference as a new item without copying (already in library).
	const f = untrackedFiles.find((x) => x.name === name);
	if (!f) return;
	const ext = (f.name.slice(f.name.lastIndexOf('.')) || '').toLowerCase();
	const type: Item['type'] = f.name.endsWith('.webloc') || f.name.endsWith('.html') ? 'link' : guessType('', f.name);
	const title = f.name.replace(/\.[^.]+$/, '');
	addItem({
		type,
		title,
		filename: f.name,
		url: null,
		tags: [],
		note: null,
		colors: [],
		faviconFile: null,
		width: null,
		height: null
	});
	untrackedFiles = untrackedFiles.filter((x) => x.name !== name);
	toast(`Imported "${title}"`, 'success');
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export function addCollection(name: string, parentId: string | null = null): Collection {
	const col: Collection = {
		id: newId('col'),
		name,
		parentId,
		icon: null,
		createdAt: Date.now()
	};
	manifest.collections.push(col);
	persist();
	return col;
}

export function updateCollection(id: string, patch: Partial<Collection>) {
	const col = manifest.collections.find((c) => c.id === id);
	if (!col) return;
	Object.assign(col, patch);
	persist();
}

export function deleteCollection(id: string) {
	const children = manifest.collections.filter((c) => c.parentId === id);
	for (const c of children) deleteCollection(c.id);
	manifest.collections = manifest.collections.filter((c) => c.id !== id);
	for (const item of manifest.items) {
		item.collectionIds = item.collectionIds.filter((c) => c !== id);
	}
	persist();
}

export function collectionItems(id: string): number {
	return manifest.items.filter((i) => i.collectionIds.includes(id)).length;
}

export function rootCollections(): Collection[] {
	return manifest.collections.filter((c) => !c.parentId);
}

export function childCollections(id: string): Collection[] {
	return manifest.collections.filter((c) => c.parentId === id);
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export async function saveUrl(url: string, title?: string, collectionId: string | null = null): Promise<Item | null> {
	if (!/^https?:\/\//i.test(url.trim())) {
		toast('Enter a valid http(s) URL', 'error');
		return null;
	}
	busy = true;
	try {
		const res = await backend.saveLink(url.trim(), title);
		const item = addItem({
			type: 'link',
			title: res.title || title || url,
			filename: res.filename,
			url: url.trim(),
			collectionIds: collectionId ? [collectionId] : [],
			faviconFile: res.favicon_file ?? null,
			imageFile: res.image_file ?? null
		});
		toast(`Saved "${item.title}"`, 'success');
		if (manifest.settings.ai.autoTag) void aiTagItem(item, manifest.settings.ai);
		return item;
	} catch (e) {
		console.error(e);
		toast(`Could not save that URL`, 'error');
		return null;
	} finally {
		busy = false;
	}
}

export async function saveFiles(files: File[], collectionId: string | null = null): Promise<number> {
	let count = 0;
	for (const f of files) {
		try {
			const buf = new Uint8Array(await f.arrayBuffer());
			const b64 = bytesToBase64(buf);
			const name = sanitizeFilename(f.name || `clip-${Date.now()}`);
			const filename = await backend.writeItemFile(name, b64);
			const type = guessType(f.type, filename);
			const item = addItem({
				type,
				title: name.replace(/\.[^.]+$/, ''),
				filename,
				collectionIds: collectionId ? [collectionId] : []
			});
			if (type === 'image') void autoColorItem(item);
			count++;
		} catch (e) {
			console.error('save file failed', e);
		}
	}
	if (count > 0) toast(`Saved ${count} file${count > 1 ? 's' : ''}`, 'success');
	return count;
}

export async function saveText(text: string, title?: string, collectionId: string | null = null) {
	const name = sanitizeFilename(title || `note-${Date.now()}`);
	const filename = await backend.writeItemFile(`${name}.md`, bytesToBase64(new TextEncoder().encode(text)));
	addItem({
		type: 'note',
		title: title || name,
		filename,
		collectionIds: collectionId ? [collectionId] : [],
		note: text
	});
	toast('Note saved', 'success');
}

export async function importExistingFile(src: string, collectionId: string | null = null) {
	try {
		const filename = await backend.importFile(src);
		addItem({
			type: guessType('', filename),
			title: filename.replace(/\.[^.]+$/, ''),
			filename,
			collectionIds: collectionId ? [collectionId] : []
		});
		toast(`Imported "${filename}"`, 'success');
		return filename;
	} catch (e) {
		toast(`Import failed: ${e}`, 'error');
		return null;
	}
}

// ---------------------------------------------------------------------------
// Dial (drag-to-collection capture)
// ---------------------------------------------------------------------------

export function openCaptureDial(payload: { files?: File[]; url?: string; text?: string; paths?: string[] }, x: number, y: number) {
	pendingCapture = payload;
	dialMode = 'capture';
	dialX = x;
	dialY = y;
	dialOpen = true;
}

export function openFileDial(x: number, y: number) {
	dialMode = 'file';
	dialX = x;
	dialY = y;
	dialOpen = true;
}

export function closeDial() {
	dialOpen = false;
	pendingCapture = null;
}

export async function commitCapture(collectionId: string | null) {
	const payload = pendingCapture;
	closeDial();
	if (!payload) return;
	if (payload.paths?.length) {
		await saveDroppedPaths(payload.paths, collectionId);
	} else if (payload.files?.length) {
		await saveFiles(payload.files, collectionId);
	} else if (payload.url) {
		await saveUrl(payload.url, undefined, collectionId);
	} else if (payload.text) {
		await saveText(payload.text, undefined, collectionId);
	}
}

/** Desktop file drops arrive as real filesystem paths (Tauri drag-drop event). */
export async function saveDroppedPaths(paths: string[], collectionId: string | null = null): Promise<number> {
	let count = 0;
	for (const p of paths) {
		try {
			const filename = await backend.importFile(p);
			const type = guessType('', filename);
			const item = addItem({
				type,
				title: filename.replace(/\.[^.]+$/, ''),
				filename,
				collectionIds: collectionId ? [collectionId] : []
			});
			if (type === 'image') void autoColorItem(item);
			count++;
		} catch (e) {
			console.error('import dropped file failed', e);
		}
	}
	if (count > 0) toast(`Saved ${count} file${count > 1 ? 's' : ''}`, 'success');
	return count;
}

// ---------------------------------------------------------------------------
// Colour / image helpers
// ---------------------------------------------------------------------------

export function getFileUrl(item: Item): string {
	return backend.fileUrl(item.filename);
}

export function cardImageUrl(item: Item): string | null {
	if (item.type === 'image' || item.type === 'video') {
		const u = getFileUrl(item);
		return u || null;
	}
	if (item.imageFile) {
		return backend.fileUrl(item.imageFile);
	}
	return null;
}

export async function autoColorItem(item: Item) {
	const url = cardImageUrl(item);
	if (!url) return;
	const img = new Image();
	img.crossOrigin = 'anonymous';
	await new Promise((resolve) => {
		img.onload = resolve;
		img.onerror = resolve;
		img.src = url;
	});
	if (img.naturalWidth) {
		const palette = extractPalette(img, 5);
		updateItem(item.id, { colors: palette, width: img.naturalWidth, height: img.naturalHeight });
	}
}

export async function ocrItem(item: Item) {
	if (item.type !== 'image') {
		toast('OCR works on images', 'error');
		return;
	}
	busy = true;
	try {
		const text = await ocrImage(getFileUrl(item));
		if (text) {
			updateItem(item.id, { ocrText: text });
			toast('Text read from image', 'success');
		} else {
			toast('No text found', 'info');
		}
	} catch (e) {
		console.error(e);
		toast('OCR failed', 'error');
	} finally {
		busy = false;
	}
}

// ---------------------------------------------------------------------------
// AI helpers (delegated to ai.ts, wired to the store for state)
// ---------------------------------------------------------------------------

export function aiReady(): boolean {
	return aiConfigured(manifest.settings.ai);
}

export async function runAiTag(item: Item) {
	busy = true;
	try {
		const tags = await aiTagItem(item, manifest.settings.ai);
		if (tags.length) {
			item.tags = [...new Set([...item.tags, ...tags])];
			item.aiTags = [...new Set([...(item.aiTags ?? []), ...tags])];
			persist();
			toast(`Tagged: ${tags.join(', ')}`, 'success');
		} else {
			toast('AI returned no tags', 'info');
		}
	} catch (e) {
		toast(`AI failed: ${e instanceof Error ? e.message : e}`, 'error');
	} finally {
		busy = false;
	}
}

export async function runAiRename(item: Item) {
	busy = true;
	try {
		const name = await aiRename(item, manifest.settings.ai);
		if (name) {
			await renameTitle(item.id, name, true);
			toast(`Renamed to "${name}"`, 'success');
		}
	} catch (e) {
		toast(`AI failed: ${e instanceof Error ? e.message : e}`, 'error');
	} finally {
		busy = false;
	}
}

export async function runAiArtPrompt(item: Item) {
	busy = true;
	try {
		const prompt = await aiArtPrompt(item, manifest.settings.ai);
		return prompt;
	} catch (e) {
		toast(`AI failed: ${e instanceof Error ? e.message : e}`, 'error');
		return null;
	} finally {
		busy = false;
	}
}

export async function runAiSearch() {
	const q = searchQuery.trim();
	if (!q) return;
	busy = true;
	try {
		const ids = await aiSemanticSearch(q, filteredItems(), manifest.settings.ai);
		if (ids.length) {
			// Temporarily narrow via a special selection: keep items whose id matched.
			searchResultIds = new Set(ids);
			toast(`AI found ${ids.length} matches`, 'success');
		} else {
			toast('AI found no matches', 'info');
		}
	} catch (e) {
		toast(`AI failed: ${e instanceof Error ? e.message : e}`, 'error');
	} finally {
		busy = false;
	}
}


// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

export function canvasPos(item: Item): { x: number; y: number; w: number; h: number } {
	return manifest.canvas?.[item.id] ?? { x: 0, y: 0, w: 220, h: 150 };
}

export function placeOnCanvas(id: string, x: number, y: number, w: number, h: number) {
	if (!manifest.canvas) manifest.canvas = {};
	manifest.canvas[id] = { x, y, w, h };
	persist();
}

export function clearCanvas() {
	manifest.canvas = {};
	persist();
}

export function similarItems(item: Item): Item[] {
	return manifest.items
		.filter((i) => i.id !== item.id && (i.colors?.length || item.colors?.length))
		.map((i) => {
			let score = 0;
			for (const c of i.colors ?? []) {
				for (const t of item.colors ?? []) {
					score += 1 / (1 + colorDistance(c, t) / 40);
				}
			}
			return { item: i, score };
		})
		.sort((a, b) => b.score - a.score)
		.filter((x) => x.score > 0.3)
		.slice(0, 6)
		.map((x) => x.item);
}

// ---------------------------------------------------------------------------
// Context menu + ask modal
// ---------------------------------------------------------------------------

export interface MenuItem {
	label?: string;
	icon?: string;
	danger?: boolean;
	disabled?: boolean;
	separator?: boolean;
	action?: () => void;
	children?: MenuItem[];
}

export interface MenuState {
	x: number;
	y: number;
	stack: { title: string; items: MenuItem[] }[];
}

let menu = $state<MenuState | null>(null);

export function showMenu(x: number, y: number, items: MenuItem[]) {
	menu = { x, y, stack: [{ title: '', items }] };
}

export function pushMenu(title: string, items: MenuItem[]) {
	if (menu) menu.stack.push({ title, items });
}

export function popMenu() {
	if (menu) {
		menu.stack.pop();
		if (!menu.stack.length) menu = null;
	}
}

export function closeMenu() {
	menu = null;
}

let ask = $state<{
	title: string;
	placeholder?: string;
	initial?: string;
	okLabel?: string;
	onOk: (value: string) => void;
} | null>(null);

export function askInput(
	title: string,
	placeholder: string,
	initial: string,
	onOk: (value: string) => void
) {
	ask = { title, placeholder, initial, okLabel: 'OK', onOk };
}

export function closeAsk() {
	ask = null;
}

export async function pasteFromClipboard() {
	try {
		const items = await navigator.clipboard.read();
		const files: File[] = [];
		let text = '';
		for (const it of items) {
			for (const type of it.types) {
				if (type.startsWith('image/')) {
					const blob = await it.getType(type);
					files.push(new File([blob], `clip-${Date.now()}.png`, { type }));
				} else if (type === 'text/plain') {
					text = (await (await it.getType(type)).text()).trim();
				}
			}
		}
		if (files.length) {
			const n = await saveFiles(files, selectedCollectionId);
			toast(`Saved ${n} file${n > 1 ? 's' : ''} from clipboard`, 'success');
		} else if (text) {
			if (/^https?:\/\//i.test(text)) await saveUrl(text, undefined, selectedCollectionId);
			else await saveText(text, undefined, selectedCollectionId);
		} else {
			toast('Nothing usable in the clipboard', 'info');
		}
	} catch {
		toast('Clipboard read blocked — paste into Capture instead', 'error');
	}
}

export function cycleCollectionIcon(id: string) {
	const col = manifest.collections.find((c) => c.id === id);
	if (!col) return;
	const icons = ['folder', 'sparkles', 'palette', 'type', 'code', 'book-open', 'image', 'music', 'video', 'map', 'utensils', 'heart', 'rocket', 'globe', 'camera', 'star'];
	const i = icons.indexOf(col.icon ?? 'folder');
	updateCollection(id, { icon: icons[(i + 1) % icons.length] });
}

export async function copyImageToClipboard(item: Item) {
	try {
		const url = getFileUrl(item);
		if (!url) {
			toast('No image file for this item', 'error');
			return;
		}
		const resp = await fetch(url);
		const blob = await resp.blob();
		await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
		toast('Image copied', 'success');
	} catch (e) {
		console.error(e);
		toast('Could not copy the image', 'error');
	}
}

export async function copyTextToClipboard(text: string, label = 'Copied') {
	if (!text) return;
	try {
		await navigator.clipboard.writeText(text);
		toast(`${label} copied`, 'success');
	} catch {
		toast('Clipboard blocked', 'error');
	}
}

// ---------------------------------------------------------------------------
// Setters (runes forbid assigning to imported bindings)
// ---------------------------------------------------------------------------

export function setSearch(q: string) {
	searchQuery = q;
}

export function setColor(c: string | null) {
	activeColorSearch = c;
}

export function openCapture() {
	captureOpen = true;
}

export function closeCapture() {
	captureOpen = false;
}

export function openSettings() {
	settingsOpen = true;
}

export function closeSettings() {
	settingsOpen = false;
}

export function setCollection(id: string | null) {
	selectedCollectionId = id;
}

export function setSelected(id: string | null) {
	selectedItemId = id;
}

export function toggleSelect(id: string) {
	selectedItemId = selectedItemId === id ? null : id;
}

export function setLibraryDirState(path: string) {
	libraryDir = path;
}

export function setBackupMeta(m: BackupMeta | null) {
	backupMeta = m;
}

export function setDialPos(x: number, y: number) {
	dialX = x;
	dialY = y;
}

export function setPendingCapture(p: { files?: File[]; url?: string; text?: string; paths?: string[] } | null) {
	pendingCapture = p;
}

export function clearAiSearch() {
	searchResultIds.clear();
}

// ---------------------------------------------------------------------------
// ui: read/write bridge for exported state (runes can't export mutable bindings)
// ---------------------------------------------------------------------------

/**
 * Reactive accessor object for module-level state. Reads and writes go
 * through compiled signal accessors, so components stay reactive.
 */
export const ui = {
	get libraryDir() {
		return libraryDir;
	},
	set libraryDir(v: string) {
		libraryDir = v;
	},
	get loading() {
		return loading;
	},
	set loading(v: boolean) {
		loading = v;
	},
	get busy() {
		return busy;
	},
	set busy(v: boolean) {
		busy = v;
	},
	get selectedCollectionId() {
		return selectedCollectionId;
	},
	set selectedCollectionId(v: string | null) {
		selectedCollectionId = v;
	},
	get selectedItemId() {
		return selectedItemId;
	},
	set selectedItemId(v: string | null) {
		selectedItemId = v;
	},
	get searchQuery() {
		return searchQuery;
	},
	set searchQuery(v: string) {
		searchQuery = v;
	},
	get activeColorSearch() {
		return activeColorSearch;
	},
	set activeColorSearch(v: string | null) {
		activeColorSearch = v;
	},
	get captureOpen() {
		return captureOpen;
	},
	set captureOpen(v: boolean) {
		captureOpen = v;
	},
	get settingsOpen() {
		return settingsOpen;
	},
	set settingsOpen(v: boolean) {
		settingsOpen = v;
	},
	get importOpen() {
		return importOpen;
	},
	set importOpen(v: boolean) {
		importOpen = v;
	},
	get dialOpen() {
		return dialOpen;
	},
	set dialOpen(v: boolean) {
		dialOpen = v;
	},
	get dialX() {
		return dialX;
	},
	set dialX(v: number) {
		dialX = v;
	},
	get dialY() {
		return dialY;
	},
	set dialY(v: number) {
		dialY = v;
	},
	get dialMode() {
		return dialMode;
	},
	set dialMode(v: 'capture' | 'file') {
		dialMode = v;
	},
	get pendingCapture() {
		return pendingCapture;
	},
	set pendingCapture(v: { files?: File[]; url?: string; text?: string; paths?: string[] } | null) {
		pendingCapture = v;
	},
	get missingIds() {
		return missingIds;
	},
	set missingIds(v: Set<string>) {
		missingIds = v;
	},
	get untrackedFiles() {
		return untrackedFiles;
	},
	set untrackedFiles(v: FileMeta[]) {
		untrackedFiles = v;
	},
	get backupMeta() {
		return backupMeta;
	},
	set backupMeta(v: BackupMeta | null) {
		backupMeta = v;
	},
	get searchResultIds() {
		return searchResultIds;
	},
	set searchResultIds(v: Set<string>) {
		searchResultIds = v;
	},
	get menu() {
		return menu;
	},
	set menu(v: MenuState | null) {
		menu = v;
	},
	get ask() {
		return ask;
	},
	set ask(v: { title: string; placeholder?: string; initial?: string; okLabel?: string; onOk: (value: string) => void } | null) {
		ask = v;
	}
};

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

export function bindShortcuts() {
	window.addEventListener('keydown', (e) => {
		const target = e.target as HTMLElement;
		const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
		if (typing) return;
		if ((e.metaKey || e.ctrlKey) && e.key === '/') {
			e.preventDefault();
			window.dispatchEvent(new CustomEvent('fractalgrab://toggle-shortcuts'));
		} else if (e.key === '/') {
			e.preventDefault();
			document.getElementById('app-search')?.focus();
		} else if (e.key === 'c' || e.key === 'C') {
			captureOpen = true;
		} else if (e.key === 'Escape') {
			if (dialOpen) closeDial();
			else if (captureOpen) captureOpen = false;
			else if (selectedItemId) selectedItemId = null;
			else batchSelection.clear();
		} else if (e.key === 'Delete' || e.key === 'Backspace') {
			if (batchSelection.size) deleteItems([...batchSelection]);
			else if (selectedItemId) deleteItems([selectedItemId]);
		}
	});
}
