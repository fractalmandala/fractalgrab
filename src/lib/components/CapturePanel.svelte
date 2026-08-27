<script lang="ts">
	import { FileUp, ImagePlus, Link2, StickyNote, X } from '@lucide/svelte';
	import Icon from './Icon.svelte';
	import { backend, isTauri } from '../backend';
	import {
		openCaptureDial,
		saveFiles,
		saveText,
		saveUrl,
		toast,
		manifest,
		importExistingFile,
		closeCapture,
		ui
	} from '../store.svelte';
	import { parseBookmarksHtml, parseCsv, parseJson, type ImportedItem } from '../importers';
	import { addCollection, updateCollection } from '../store.svelte';
	import { suggestIcon } from '../iconSuggest';

	type Tab = 'link' | 'paste' | 'files' | 'text' | 'import';
	let tab = $state<Tab>('link');
	let url = $state('');
	let pasteText = $state('');
	let textBody = $state('');
	let textTitle = $state('');
	let dropActive = $state(false);
	let importKind = $state<'csv' | 'json' | 'bookmarks' | null>(null);
	let importFileInput = $state<HTMLInputElement>();

	function reset() {
		tab = 'link';
		url = '';
		pasteText = '';
		textBody = '';
		textTitle = '';
		importKind = null;
	}

	async function doSaveUrl() {
		const saved = await saveUrl(url, undefined, ui.selectedCollectionId);
		if (saved) {
			closeCapture();
			reset();
		}
	}

	async function doPaste() {
		const text = pasteText.trim();
		if (!text) return;
		if (/^https?:\/\//i.test(text)) {
			await saveUrl(text, undefined, ui.selectedCollectionId);
		} else {
			await saveText(text, undefined, ui.selectedCollectionId);
		}
		closeCapture();
		reset();
	}

	async function readClipboard() {
		try {
			const items = await navigator.clipboard.read();
			const files: File[] = [];
			for (const it of items) {
				for (const type of it.types) {
					if (type.startsWith('image/')) {
						const blob = await it.getType(type);
						files.push(new File([blob], `clip-${Date.now()}.png`, { type }));
					} else if (type === 'text/plain') {
						const text = await (await it.getType(type)).text();
						if (text.trim() && /^https?:\/\//i.test(text.trim())) pasteText = text.trim();
						else if (text.trim()) textBody = text.trim();
					}
				}
			}
			if (files.length) {
				const n = await saveFiles(files, ui.selectedCollectionId);
				if (n) {
					closeCapture();
					reset();
				}
			} else if (!pasteText && !textBody) {
				toast('Nothing image-like in the clipboard', 'info');
			}
		} catch {
			toast('Clipboard read blocked — paste into the box instead', 'error');
		}
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dropActive = false;
		const types = e.dataTransfer?.types ?? [];
		// Desktop: external file drops arrive via the Tauri drag-drop event
		// with real paths — the DOM drop only handles in-app item drags.
		if (isTauri() && !types.includes('application/x-fractalgrab')) return;
		const files = e.dataTransfer?.files;
		if (files?.length) {
			openCaptureDial({ files: [...files] }, e.clientX, e.clientY);
		} else {
			const text = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
			if (text?.trim() && /^https?:\/\//i.test(text.trim())) {
				openCaptureDial({ url: text.trim() }, e.clientX, e.clientY);
			} else if (text?.trim()) {
				openCaptureDial({ text: text.trim() }, e.clientX, e.clientY);
			}
		}
	}

	function pickFiles() {
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = true;
		input.onchange = async () => {
			const files = input.files ? [...input.files] : [];
			if (files.length) {
				const n = await saveFiles(files, ui.selectedCollectionId);
				if (n) {
					closeCapture();
					reset();
				}
			}
		};
		input.click();
	}

	async function importFile() {
		if (!isTauri()) {
			importFileInput?.click();
			return;
		}
		const files = await backend.chooseFiles();
		for (const src of files) {
			const f = await importExistingFile(src, ui.selectedCollectionId);
			if (!f) break;
		}
		closeCapture();
		reset();
	}

	async function onImportFileSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const text = await file.text();
		let parsed: ImportedItem[] = [];
		if (importKind === 'csv') parsed = parseCsv(text);
		else if (importKind === 'json') parsed = parseJson(text);
		else if (importKind === 'bookmarks') parsed = parseBookmarksHtml(text);
		if (!parsed.length) {
			toast('No importable items found', 'error');
			return;
		}
		// create collections from bookmark folders
		const folderMap = new Map<string, string>();
		let count = 0;
		for (const row of parsed) {
			const colIds: string[] = [];
			for (const folder of row.folders) {
				if (!folderMap.has(folder)) {
					const col = addCollection(folder, null);
					updateCollection(col.id, { icon: suggestIcon(folder) });
					folderMap.set(folder, col.id);
				}
				colIds.push(folderMap.get(folder)!);
			}
			if (row.url) {
				await saveUrl(row.url, row.title, null);
			} else {
				await saveText(row.note ?? row.title, row.title, null);
			}
			count++;
		}
		toast(`Imported ${count} items`, 'success');
		closeCapture();
		reset();
	}
</script>

{#if ui.captureOpen}
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) closeCapture(); }}>
		<div class="panel">
			<div class="panel-header">
				<h2 class="text-lg" style="margin:0;">Capture</h2>
				<button class="button" data-variant="icon" onclick={closeCapture}><X size={18} /></button>
			</div>

			<div class="tabs">
				<button class="tab" data-state={tab === 'link' ? 'active' : 'idle'} onclick={() => (tab = 'link')}><Link2 size={13} /> Link</button>
				<button class="tab" data-state={tab === 'paste' ? 'active' : 'idle'} onclick={() => (tab = 'paste')}><ImagePlus size={13} /> Paste</button>
				<button class="tab" data-state={tab === 'files' ? 'active' : 'idle'} onclick={() => (tab = 'files')}><FileUp size={13} /> Files</button>
				<button class="tab" data-state={tab === 'text' ? 'active' : 'idle'} onclick={() => (tab = 'text')}><StickyNote size={13} /> Text</button>
				<button class="tab" data-state={tab === 'import' ? 'active' : 'idle'} onclick={() => (tab = 'import')}><Icon name="download" size={13} /> Import</button>
			</div>

			<div class="panel-body">
				{#if tab === 'link'}
					<div class="field">
						<label>URL</label>
						<input
							autofocus
							placeholder="https://…"
							bind:value={url}
							onkeydown={(e) => e.key === 'Enter' && doSaveUrl()}
						/>
					</div>
					<div class="row ycenter gap8">
						<button class="button" data-variant="primary" onclick={doSaveUrl} disabled={ui.busy || !url.trim()}>
							Save instantly
						</button>
						<span class="text-xs text-muted">No confirm dialog — it just saves.</span>
					</div>
				{:else if tab === 'paste'}
					<button class="button" onclick={readClipboard}>Read from clipboard</button>
					<div
						class="dropzone"
						data-state={dropActive ? 'drag' : 'idle'}
						ondragover={(e) => { e.preventDefault(); dropActive = true; }}
						ondragleave={() => (dropActive = false)}
						ondrop={onDrop}
					>
						<p style="margin:0 0 6px;">Drop an image, file, or link here</p>
						<p class="text-xs text-muted">A dial opens around your cursor — drop on a collection to file it straight in.</p>
					</div>
					<textarea rows="4" placeholder="…or paste a link or text" bind:value={pasteText}></textarea>
					<button class="button" data-variant="primary" onclick={doPaste} disabled={!pasteText.trim()}>Save</button>
				{:else if tab === 'files'}
					<div
						class="dropzone"
						data-state={dropActive ? 'drag' : 'idle'}
						ondragover={(e) => { e.preventDefault(); dropActive = true; }}
						ondragleave={() => (dropActive = false)}
						ondrop={onDrop}
					>
						<p style="margin:0 0 6px;">Drop files anywhere on this window</p>
						<p class="text-xs text-muted">Real files, copied into your library folder.</p>
					</div>
					<button class="button" onclick={pickFiles}>Choose files…</button>
					{#if isTauri()}
						<button class="button" onclick={importFile}>Import an existing file from disk…</button>
					{/if}
				{:else if tab === 'text'}
					<div class="field">
						<label>Title</label>
						<input placeholder="Note title (optional)" bind:value={textTitle} />
					</div>
					<textarea rows="6" placeholder="Write or paste anything — saved as a .md file" bind:value={textBody}></textarea>
					<button
						class="button"
						data-variant="primary"
						disabled={!textBody.trim()}								onclick={async () => {
								await saveText(textBody, textTitle || undefined, ui.selectedCollectionId);
								closeCapture();
								reset();
							}}
					>
						Save note
					</button>
				{:else}
					<div class="field">
						<label>Import</label>
						<div class="row ycenter gap8" style="flex-wrap:wrap;">
							<button class="button" onclick={() => { importKind = 'csv'; importFileInput?.click(); }}>CSV</button>
							<button class="button" onclick={() => { importKind = 'json'; importFileInput?.click(); }}>JSON</button>
							<button class="button" onclick={() => { importKind = 'bookmarks'; importFileInput?.click(); }}>Browser bookmarks</button>
						</div>
						<input
							bind:this={importFileInput}
							type="file"
							accept=".csv,.json,.html,.htm"
							style="display:none;"
							onchange={onImportFileSelected}
						/>
						<p class="text-xs text-muted">
							CSV: url,title,tags. JSON: an array of objects with url, title, tags, note. Bookmarks: the
							exported HTML file — folders become collections.
						</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
