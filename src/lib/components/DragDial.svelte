<script lang="ts">
	import Icon from './Icon.svelte';
	import { isTauri } from '../backend';
	import {
		closeDial,
		commitCapture,
		manifest,
		moveToCollection,
		openCaptureDial,
		openFileDial,
		toast,
		setDialPos,
		setPendingCapture,
		ui
	} from '../store.svelte';
	import { openDropped } from '../notes/notes.svelte';

	let dragItemId: string | null = null;
	let hotCol = $state<string | null>(null);

	const sectors = $derived(manifest.collections.slice(0, 8));
	const radius = $derived(96 + Math.max(0, sectors.length - 6) * 8);

	function sectorAngle(i: number, total: number): number {
		// start at top (-90deg), clockwise
		return -90 + (360 / total) * i;
	}

	function sectorUnder(x: number, y: number): string | null {
		const el = document.elementFromPoint(x, y);
		const sector = el?.closest?.('[data-dial-col]') as HTMLElement | null;
		return sector?.dataset.dialCol ?? null;
	}

	function externalDrag(e: DragEvent): boolean {
		const types = e.dataTransfer?.types ?? [];
		if (types.includes('application/x-fractalgrab')) return false;
		return types.includes('Files') || types.includes('text/uri-list') || types.includes('text/html') || types.includes('text/plain');
	}

	// ---- Tauri native file drops (WKWebView delivers real paths here, not
	// in dataTransfer.files) ----
	if (isTauri()) {
		import('@tauri-apps/api/webview').then(({ getCurrentWebview }) => {
			getCurrentWebview().onDragDropEvent((event) => {
				const p = event.payload;
				if (p.type === 'enter') {
					// While Notes is active, dropping Markdown files opens them
					// instead of the capture dial (PRODUCT 22).
					if (manifest.settings.view === 'notes') {
						const md = p.paths.filter((x) => /\.(md|markdown)$/i.test(x));
						if (md.length) {
							for (const m of md) void openDropped(m);
							return;
						}
					}
					const cssX = p.position.x / (window.devicePixelRatio || 1);
					const cssY = p.position.y / (window.devicePixelRatio || 1);
					openCaptureDial({ paths: p.paths }, cssX, cssY);
				} else if (p.type === 'over') {
					const cssX = p.position.x / (window.devicePixelRatio || 1);
					const cssY = p.position.y / (window.devicePixelRatio || 1);
					if (!ui.dialOpen) openCaptureDial({ paths: [] }, cssX, cssY);
					else {
						setDialPos(cssX, cssY);
						hotCol = sectorUnder(cssX, cssY);
					}
				} else if (p.type === 'drop') {
					const cssX = p.position.x / (window.devicePixelRatio || 1);
					const cssY = p.position.y / (window.devicePixelRatio || 1);
					setPendingCapture({ paths: p.paths });
					const colId = sectorUnder(cssX, cssY);
					void commitCapture(colId);
					hotCol = null;
				} else {
					const pend = ui.pendingCapture;
					if (pend && !pend.files?.length && !pend.url && !pend.text && !pend.paths?.length) closeDial();
				}
			});
		});
	}

	// ---- window-level drag handling ----
	window.addEventListener(
		'dragstart',
		(e) => {
			const t = e.dataTransfer?.types ?? [];
			if (t.includes('application/x-fractalgrab')) {
				dragItemId = e.dataTransfer?.getData('application/x-fractalgrab') ?? null;
				openFileDial(e.clientX, e.clientY);
			}
		},
		true
	);

	window.addEventListener(
		'dragover',
		(e) => {
			e.preventDefault();
			if (!ui.dialOpen) {
				// In the desktop app, external file drags arrive via the Tauri
				// drag-drop event (with real paths); DOM events only open the
				// dial for in-app item drags. Browser preview keeps the DOM path.
				if (!isTauri() && externalDrag(e)) openCaptureDial({}, e.clientX, e.clientY);
				return;
			}
			setDialPos(e.clientX, e.clientY);
			hotCol = sectorUnder(e.clientX, e.clientY);
		},
		true
	);

	window.addEventListener(
		'drop',
		async (e) => {
			e.preventDefault();
			const types = e.dataTransfer?.types ?? [];
			// External file drops in the desktop app are owned by the Tauri
			// drag-drop event — never turn a file:// path into a text note.
			if (isTauri() && !types.includes('application/x-fractalgrab')) return;
			if (!ui.dialOpen) return;
			const colId = sectorUnder(e.clientX, e.clientY);

			if (ui.dialMode === 'file' && dragItemId) {
				if (colId) {
					moveToCollection(dragItemId, colId, true);
					const name = manifest.collections.find((c) => c.id === colId)?.name ?? '';
					toast(`Filed into "${name}"`, 'success');
				}
				dragItemId = null;
				closeDial();
				return;
			}

			// capture mode
			const files = e.dataTransfer?.files ? [...e.dataTransfer.files] : [];
			let url: string | undefined;
			let text: string | undefined;
			if (!files.length) {
				const raw =
					e.dataTransfer?.getData('text/uri-list') ||
					e.dataTransfer?.getData('text/plain') ||
					'';
				const first = raw.split('\n')[0].trim();
				if (/^https?:\/\//i.test(first)) url = first;
				else if (raw.trim()) text = raw.trim();
			}
			// merge with what the dial already knows
			const payload = {
				files: files.length ? files : ui.pendingCapture?.files,
				url: url ?? ui.pendingCapture?.url,
				text: text ?? ui.pendingCapture?.text
			};
			setPendingCapture(payload);
			await commitCapture(colId);
			hotCol = null;
		},
		true
	);

	window.addEventListener(
		'click',
		(e) => {
			const t = e.target as HTMLElement | null;
			if (ui.dialOpen && !t?.closest?.('[data-dial-col]')) {
				closeDial();
			}
		},
		true
	);
</script>

{#if ui.dialOpen}
	<div
		class="dial"
		style="left:{ui.dialX}px; top:{ui.dialY}px;"
	>
		<div class="dial-center" title="Cancel">
			{#if ui.dialMode === 'file'}
				<Icon name="folder-open" size={22} />
			{:else}
				<Icon name="image-plus" size={22} />
			{/if}
		</div>

		{#if sectors.length}
			{#each sectors as col, i (col.id)}
				<button
					class="dial-sector"
					data-state={hotCol === col.id ? 'hot' : 'idle'}
					style="--a:{sectorAngle(i, sectors.length)}deg; --r:{radius}px;"
					data-dial-col={col.id}
					onclick={() => commitCapture(col.id)}
				>
					<Icon name={col.icon ?? 'folder'} size={14} />
					{col.name}
				</button>
			{/each}
		{:else}
			<button
				class="dial-sector"
				data-state={hotCol ? 'hot' : 'idle'}
				style="--a:0deg; --r:{radius}px;"
				data-dial-col="__all__"
				onclick={() => commitCapture(null)}
			>
				<Icon name="layers" size={14} /> All items
			</button>
		{/if}
	</div>
{/if}
