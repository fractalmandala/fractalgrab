import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open as dialogOpen } from '@tauri-apps/plugin-dialog';
import type { BackupMeta, FileMeta, Vault, VaultNode } from './types';

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface LinkSave {
	filename: string;
	title: string;
	favicon_file?: string | null;
	image_file?: string | null;
}

export interface NoteRead {
	text: string;
	mtime_ms: number;
}

export interface NoteWriteResult {
	conflict: boolean;
	mtime_ms: number;
}

export interface Backend {
	getLibraryDir(): Promise<string>;
	setLibraryDir(path: string): Promise<string>;
	readManifest(): Promise<string | null>;
	writeManifest(contents: string): Promise<void>;
	listLibrary(): Promise<FileMeta[]>;
	importFile(src: string): Promise<string>;
	writeItemFile(filename: string, dataB64: string): Promise<string>;
	deleteFile(filename: string): Promise<void>;
	renameFile(oldName: string, newName: string): Promise<string>;
	openItem(filename?: string, url?: string): Promise<void>;
	revealInFinder(filename: string): Promise<void>;
	saveLink(url: string, title?: string): Promise<LinkSave>;
	backupNow(): Promise<string>;
	getBackupMeta(): Promise<BackupMeta | null>;
	setExtensionServer(enabled: boolean): Promise<boolean>;
	chooseFolder(): Promise<string | null>;
	chooseFiles(): Promise<string[]>;
	chooseMarkdownFile(): Promise<string | null>;
	fileUrl(filename: string): string;
	pathFileUrl(path: string): string;
	openPathExternal(path: string): Promise<void>;
	readFileAsDataUrl(filename: string): Promise<string>;
	notesListVaults(): Promise<Vault[]>;
	notesAddVault(path: string): Promise<Vault>;
	notesRemoveVault(id: string): Promise<void>;
	notesSetActiveVault(id: string): Promise<void>;
	notesScan(path: string): Promise<VaultNode>;
	notesRead(path: string): Promise<NoteRead>;
	notesWrite(path: string, text: string, expectedMtimeMs: number | null): Promise<NoteWriteResult>;
	notesCopy(src: string, destDir: string): Promise<string>;
	notesMove(src: string, destDir: string): Promise<string>;
	notesRename(path: string, newName: string): Promise<string>;
	notesDelete(path: string): Promise<void>;
	notesCreate(dir: string, kind: 'note' | 'folder', name: string): Promise<string>;
}

// Browser-mode in-memory file store (data URLs). Only used for preview.
const virtualFiles = new Map<string, string>();

function tauriBackend(): Backend {
	return {
		async getLibraryDir() {
			return invoke<string>('get_library_dir');
		},
		async setLibraryDir(path) {
			return invoke<string>('set_library_dir', { path });
		},
		async readManifest() {
			return invoke<string | null>('read_manifest');
		},
		async writeManifest(contents) {
			await invoke('write_manifest', { contents });
		},
		async listLibrary() {
			return invoke<FileMeta[]>('list_library');
		},
		async importFile(src) {
			return invoke<string>('import_file', { src });
		},
		async writeItemFile(filename, dataB64) {
			return invoke<string>('write_item_file', { filename, dataB64 });
		},
		async deleteFile(filename) {
			await invoke('delete_file', { filename });
		},
		async renameFile(oldName, newName) {
			return invoke<string>('rename_file', { old: oldName, new: newName });
		},
		async openItem(filename, url) {
			await invoke('open_item', { filename: filename ?? null, url: url ?? null });
		},
		async revealInFinder(filename) {
			await invoke('reveal_in_finder', { filename });
		},
		async saveLink(url, title) {
			return invoke<LinkSave>('save_link', { url, title: title ?? null });
		},
		async backupNow() {
			return invoke<string>('backup_now');
		},
		async getBackupMeta() {
			const raw = await invoke<string | null>('get_backup_meta');
			return raw ? (JSON.parse(raw) as BackupMeta) : null;
		},
		async setExtensionServer(enabled) {
			return invoke<boolean>('set_extension_server', { enabled });
		},
		async chooseFolder() {
			const dir = await dialogOpen({ directory: true, multiple: false });
			return typeof dir === 'string' ? dir : null;
		},
		async chooseFiles() {
			const files = await dialogOpen({ multiple: true, filters: [{ name: 'Any', extensions: ['*'] }] });
			return Array.isArray(files) ? files : files ? [files] : [];
		},
		async chooseMarkdownFile() {
			const file = await dialogOpen({
				multiple: false,
				filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
			});
			return typeof file === 'string' ? file : null;
		},
		fileUrl(filename) {
			return convertFileSrc(`${cachedLibraryDir}/${filename}`);
		},
		pathFileUrl(path) {
			return convertFileSrc(path);
		},
		async openPathExternal(path) {
			await invoke('notes_open_external', { path });
		},
		async readFileAsDataUrl() {
			return '';
		},
		async notesListVaults() {
			return invoke<Vault[]>('notes_list_vaults');
		},
		async notesAddVault(path) {
			return invoke<Vault>('notes_add_vault', { path });
		},
		async notesRemoveVault(id) {
			await invoke('notes_remove_vault', { id });
		},
		async notesSetActiveVault(id) {
			await invoke('notes_set_active_vault', { id });
		},
		async notesScan(path) {
			return invoke<VaultNode>('notes_scan', { path });
		},
		async notesRead(path) {
			return invoke<NoteRead>('notes_read', { path });
		},
		async notesWrite(path, text, expectedMtimeMs) {
			return invoke<NoteWriteResult>('notes_write', {
				path,
				text,
				expectedMtimeMs
			});
		},
		async notesCopy(src, destDir) {
			return invoke<string>('notes_copy', { src, destDir });
		},
		async notesMove(src, destDir) {
			return invoke<string>('notes_move', { src, destDir });
		},
		async notesRename(path, newName) {
			return invoke<string>('notes_rename', { path, newName });
		},
		async notesDelete(path) {
			await invoke('notes_delete', { path });
		},
		async notesCreate(dir, kind, name) {
			return invoke<string>('notes_create', { dir, kind, name });
		}
	};
}

function browserBackend(): Backend {
	return {
		async getLibraryDir() {
			return localStorage.getItem('fractalgrab:libraryPath') ?? '~/Downloads/fractalgrab (browser preview)';
		},
		async setLibraryDir(path) {
			localStorage.setItem('fractalgrab:libraryPath', path);
			return path;
		},
		async readManifest() {
			return localStorage.getItem('fractalgrab:manifest');
		},
		async writeManifest(contents) {
			localStorage.setItem('fractalgrab:manifest', contents);
		},
		async listLibrary() {
			return [];
		},
		async importFile() {
			throw new Error('importFile is not available in browser preview');
		},
		async writeItemFile(filename, dataB64) {
			virtualFiles.set(filename, `data:application/octet-stream;base64,${dataB64}`);
			return filename;
		},
		async deleteFile() {},
		async renameFile(_old, name) {
			return name;
		},
		async openItem() {},
		async revealInFinder() {},
		async saveLink(url, title) {
			// Try to fetch metadata; CORS often blocks it — the item still saves.
			let pageTitle = title ?? url;
			let favicon_file: string | null = null;
			let image_file: string | null = null;
			try {
				const ctrl = new AbortController();
				const t = setTimeout(() => ctrl.abort(), 8000);
				const resp = await fetch(url, { signal: ctrl.signal, mode: 'cors' });
				clearTimeout(t);
				if (resp.ok) {
					const html = await resp.text();
					const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
					if (m?.[1]?.trim()) pageTitle = m[1].trim();
					const og = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
					const og2 = html.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
					const imgUrl = og?.[1] ?? og2?.[1];
					if (imgUrl) {
						const imgResp = await fetch(imgUrl, { mode: 'cors' });
						if (imgResp.ok) {
							const blob = await imgResp.blob();
							const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
							image_file = `${Date.now()}.${ext}`;
							virtualFiles.set(image_file, URL.createObjectURL(blob));
						}
					}
				}
			} catch {
				// offline / CORS — fine
			}
			return {
				filename: `${Date.now()}.webloc`,
				title: pageTitle,
				favicon_file,
				image_file
			};
		},
		async backupNow() {
			const m = localStorage.getItem('fractalgrab:manifest') ?? '{}';
			const blob = new Blob([m], { type: 'application/json' });
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = `fractalgrab-export-${Date.now()}.json`;
			a.click();
			return 'downloaded export.json (browser preview)';
		},
		async getBackupMeta() {
			const raw = localStorage.getItem('fractalgrab:backupMeta');
			return raw ? (JSON.parse(raw) as BackupMeta) : null;
		},
		async setExtensionServer() {
			return false;
		},
		async chooseFolder() {
			return null;
		},
		async chooseFiles() {
			return [];
		},
		async chooseMarkdownFile() {
			return null;
		},
		fileUrl(filename) {
			return (
				virtualFiles.get(filename) ??
				localStorage.getItem(`fractalgrab:seed:${filename}`) ??
				''
			);
		},
		pathFileUrl(path) {
			return virtualFiles.get(path) ?? '';
		},
		async openPathExternal() {},
		async readFileAsDataUrl(filename) {
			const url = virtualFiles.get(filename);
			if (!url) return '';
			const resp = await fetch(url);
			const blob = await resp.blob();
			return await blobToDataUrl(blob);
		},
		async notesListVaults() {
			return [...virtualVaults];
		},
		async notesAddVault() {
			throw new Error('Adding vaults is not available in browser preview');
		},
		async notesRemoveVault() {},
		async notesSetActiveVault() {},
		async notesScan(path) {
			if (!virtualDirs.has(path)) throw new Error('Folder does not exist');
			return virtualNode(path);
		},
		async notesRead(path) {
			const text = virtualFs.get(path);
			if (text === undefined) throw new Error('File does not exist');
			return { text, mtime_ms: virtualMtimes.get(path) ?? 0 };
		},
		async notesWrite(path, text, expectedMtimeMs) {
			if (!virtualFs.has(path)) return { conflict: true, mtime_ms: 0 };
			const cur = virtualMtimes.get(path) ?? 0;
			if (expectedMtimeMs != null && expectedMtimeMs !== 0 && cur !== expectedMtimeMs) {
				return { conflict: true, mtime_ms: cur };
			}
			virtualFs.set(path, text);
			const mtime = Date.now();
			virtualMtimes.set(path, mtime);
			return { conflict: false, mtime_ms: mtime };
		},
		async notesCopy(src, destDir) {
			if (!virtualFs.has(src) && !virtualDirs.has(src)) throw new Error('Source does not exist');
			const isDir = virtualDirs.has(src);
			const name = src.split('/').filter(Boolean).pop()!;
			const out = uniqueVirtualCopyName(destDir, name);
			if (isDir) {
				for (const [p, text] of [...virtualFs]) {
					if (p.startsWith(src + '/')) virtualFs.set(p.replace(src, out), text);
				}
				for (const d of [...virtualDirs]) {
					if (d.startsWith(src + '/')) virtualDirs.add(d.replace(src, out));
				}
				virtualDirs.add(out);
			} else {
				virtualFs.set(out, virtualFs.get(src)!);
			}
			return out;
		},
		async notesMove(src, destDir) {
			if (!virtualFs.has(src) && !virtualDirs.has(src)) throw new Error('Source does not exist');
			if (destDir.startsWith(src + '/') || destDir === src) throw new Error('Cannot move a folder into itself');
			const name = src.split('/').filter(Boolean).pop()!;
			const out = destDir + '/' + name;
			if (virtualFs.has(out) || virtualDirs.has(out)) throw new Error('An item with that name already exists there');
			for (const [p, text] of [...virtualFs]) {
				if (p === src) {
					virtualFs.set(out, text);
					virtualFs.delete(p);
				} else if (p.startsWith(src + '/')) {
					virtualFs.set(p.replace(src, out), text);
					virtualFs.delete(p);
				}
			}
			for (const [p, t] of [...virtualMtimes]) {
				if (p === src) {
					virtualMtimes.set(out, t);
					virtualMtimes.delete(p);
				} else if (p.startsWith(src + '/')) {
					virtualMtimes.set(p.replace(src, out), t);
					virtualMtimes.delete(p);
				}
			}
			for (const d of [...virtualDirs]) {
				if (d === src) {
					virtualDirs.delete(d);
					virtualDirs.add(out);
				} else if (d.startsWith(src + '/')) {
					virtualDirs.delete(d);
					virtualDirs.add(d.replace(src, out));
				}
			}
			return out;
		},
		async notesRename(path, newName) {
			const parent = path.slice(0, path.lastIndexOf('/'));
			const out = parent + '/' + newName;
			if (virtualFs.has(out) || virtualDirs.has(out)) throw new Error('An item with that name already exists');
			const isDir = virtualDirs.has(path);
			if (isDir) {
				for (const [p, text] of [...virtualFs]) {
					if (p.startsWith(path + '/')) {
						virtualFs.set(p.replace(path, out), text);
						virtualFs.delete(p);
					}
				}
				for (const [p, t] of [...virtualMtimes]) {
					if (p.startsWith(path + '/')) {
						virtualMtimes.set(p.replace(path, out), t);
						virtualMtimes.delete(p);
					}
				}
				for (const d of [...virtualDirs]) {
					if (d === path) virtualDirs.delete(d);
					else if (d.startsWith(path + '/')) {
						virtualDirs.delete(d);
						virtualDirs.add(d.replace(path, out));
					}
				}
				virtualDirs.add(out);
			} else {
				const text = virtualFs.get(path);
				if (text === undefined) throw new Error('Item does not exist');
				virtualFs.delete(path);
				virtualFs.set(out, text);
				const m = virtualMtimes.get(path);
				if (m !== undefined) {
					virtualMtimes.delete(path);
					virtualMtimes.set(out, m);
				}
			}
			return out;
		},
		async notesDelete(path) {
			for (const p of [...virtualFs.keys()]) {
				if (p === path || p.startsWith(path + '/')) virtualFs.delete(p);
			}
			for (const p of [...virtualMtimes.keys()]) {
				if (p === path || p.startsWith(path + '/')) virtualMtimes.delete(p);
			}
			for (const d of [...virtualDirs]) {
				if (d === path || d.startsWith(path + '/')) virtualDirs.delete(d);
			}
		},
		async notesCreate(dir, kind, name) {
			const out = dir + '/' + name;
			if (virtualFs.has(out) || virtualDirs.has(out)) throw new Error('An item with that name already exists');
			if (kind === 'note') {
				virtualFs.set(out, '');
				virtualMtimes.set(out, Date.now());
				addVirtualParents(out);
			} else {
				virtualDirs.add(out);
			}
			return out;
		}
	};
}

// --- Browser-mode virtual vault: an in-memory markdown vault for preview. ---
const virtualVaults: Vault[] = [
	{ id: 'vault-preview', path: '/Vault', name: 'Preview Vault', exists: true }
];
const virtualDirs = new Set<string>(['/Vault', '/Vault/notes', '/Vault/notes/deep', '/Vault/Projects']);
const virtualMtimes = new Map<string, number>();
const virtualFs = new Map<string, string>();

function addVirtualParents(path: string) {
	const parts = path.split('/').filter(Boolean);
	let cur = '';
	for (const part of parts) {
		cur += '/' + part;
		virtualDirs.add(cur);
	}
}

function uniqueVirtualCopyName(dir: string, name: string) {
	const dot = name.lastIndexOf('.');
	const stem = dot > 0 ? name.slice(0, dot) : name;
	const ext = dot > 0 ? name.slice(dot) : '';
	let n = 0;
	for (;;) {
		n += 1;
		const candidate = n === 1 ? `${stem} copy${ext}` : `${stem} copy ${n}${ext}`;
		if (!virtualFs.has(dir + '/' + candidate) && !virtualDirs.has(dir + '/' + candidate)) return dir + '/' + candidate;
	}
}

function virtualNode(dir: string): VaultNode {
	const files: string[] = [];
	const dirs: string[] = [];
	const prefix = dir === '/' ? '/' : dir + '/';
	for (const d of virtualDirs) {
		if (d !== dir && d.startsWith(prefix)) {
			const rel = d.slice(prefix.length);
			if (!rel.includes('/')) dirs.push(rel);
		}
	}
	for (const p of virtualFs.keys()) {
		if (p.startsWith(prefix)) {
			const rel = p.slice(prefix.length);
			if (!rel.includes('/') && /^[^.]/.test(rel)) files.push(rel);
		}
	}
	dirs.sort();
	files.sort();
	return {
		name: dir.split('/').filter(Boolean).pop() ?? dir,
		dirs: dirs.map((d) => virtualNode(dir + '/' + d)),
		files
	};
}

function seedVirtualFs() {
	const seed: [string, string][] = [
		[
			'/Vault/Welcome.md',
			`---
title: Welcome to Notes
description: A tour of FractalGrab's markdown notes
---

# Welcome to Notes

FractalGrab's Markdown notes live here. Right-click anywhere in the vault tree to **create**, **rename**, **copy**, **move**, or **delete** files and folders.

## Try it

- Click a file to open it as a tab
- Toggle **Raw / Rich** to switch between source and rendered editing
- Press Cmd/Ctrl + S to save

### A table

| Name | Purpose |
| ---- | ------- |
| Raw | Source editing |
| Rich | Rendered editing |

> Blockquotes are supported too.
`
		],
		[
			'/Vault/notes/Getting started.md',
			`# Getting started

1. **Add a vault** — pick any local folder from the vault selector.
2. Open any markdown document, even outside the vault, via *Open file…*.
3. Edit in **Raw** or **Rich** view and save.

    Indented code sample:

    \`\`\`
    npm run dev
    \`\`\`
`
		],
		['/Vault/notes/deep/Nested note.md', '# Nested\n\nThis one lives two levels deep.\n'],
		['/Vault/Projects/roadmap.md', '# Roadmap\n\n- [x] Notes module\n- [ ] Image insertion\n- [ ] Autosave tuning\n']
	];
	for (const [p, text] of seed) {
		virtualFs.set(p, text);
		virtualMtimes.set(p, 1700000000000 + p.length * 1000);
	}
}
seedVirtualFs();

export function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

// Keep a cached library path for the fileUrl helper in Tauri mode.
let cachedLibraryDir = '';
export function cacheLibraryDir(path: string) {
	cachedLibraryDir = path;
}

function buildBackend(): Backend {
	const impl = isTauri() ? tauriBackend() : browserBackend();
	return {
		...impl,
		fileUrl(filename: string) {
			if (isTauri()) {
				return convertFileSrc(`${cachedLibraryDir}/${filename}`);
			}
			return (impl as ReturnType<typeof browserBackend>).fileUrl(filename);
		}
	};
}

export const backend = buildBackend();
