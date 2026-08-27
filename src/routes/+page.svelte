<script lang="ts">
	import { onMount } from 'svelte';
	import {
		LayoutGrid,
		LayoutList,
		List,
		CalendarRange,
		Grid2x2,
		NotebookPen,
		Plus,
		Settings,
		Sparkles,
		Star,
		Trash2,
		Upload,
		X,
		Search,
		Palette
	} from '@lucide/svelte';
	import CollectionTree from '../lib/components/CollectionTree.svelte';
	import NotesSidebar from '../lib/components/notes/NotesSidebar.svelte';
	import NotesView from '../lib/components/notes/NotesView.svelte';
	import Views from '../lib/components/Views.svelte';
	import ItemDetail from '../lib/components/ItemDetail.svelte';
	import CapturePanel from '../lib/components/CapturePanel.svelte';
	import SettingsDialog from '../lib/components/SettingsDialog.svelte';
	import DragDial from '../lib/components/DragDial.svelte';
	import Toasts from '../lib/components/Toasts.svelte';
	import ContextMenu from '../lib/components/ContextMenu.svelte';
	import CanvasView from '../lib/components/CanvasView.svelte';
	import Icon from '../lib/components/Icon.svelte';
	import { isTauri } from '../lib/backend';
	import {
		batchSelection,
		bindShortcuts,
		deleteItems,
		load,
		manifest,
		runAiSearch,
		toast,
		importUntracked,
		collectionName,
		persist,
		setSearch,
		setColor,
		openCapture,
		openSettings,
		clearAiSearch,
		aiReady,
		ui
	} from '../lib/store.svelte';
	import { initNotes } from '../lib/notes/notes.svelte';
	import { notesUi } from '../lib/notes/notes.svelte';
	import { colorName } from '../lib/color';
	import type { ViewMode } from '../lib/types';

	let tagForBatch = $state('');
	let batchCollectionOpen = $state(false);
	let colorSearchOpen = $state(false);

	const paletteChips = $derived.by(() => {
		const seen = new Map<string, number>();
		for (const item of manifest.items) {
			for (const c of item.colors ?? []) {
				seen.set(c, (seen.get(c) ?? 0) + 1);
			}
		}
		return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([hex]) => hex);
	});

	const views: { mode: ViewMode; label: string; icon: any }[] = [
		{ mode: 'moodboard', label: 'Moodboard', icon: Grid2x2 },
		{ mode: 'cards', label: 'Cards', icon: LayoutGrid },
		{ mode: 'list', label: 'List', icon: List },
		{ mode: 'timeline', label: 'Timeline', icon: CalendarRange },
		{ mode: 'canvas', label: 'Canvas', icon: LayoutList },
		{ mode: 'notes', label: 'Notes', icon: NotebookPen }
	];

	onMount(() => {
		void load().then(() => initNotes());
		bindShortcuts();
		if (isTauri()) {
			import('@tauri-apps/api/event').then(({ listen }) => {
				listen('fractalgrab://extension-save', (e) => {
					const payload = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
					if (payload?.id && !manifest.items.some((i) => i.id === payload.id)) {
						manifest.items.unshift(payload);
						toast(`Saved from the browser: "${payload.title}"`, 'success');
					}
				});
			});
			window.addEventListener('focus', () => {
				load();
			});
		}
		// external drop anywhere in the window opens the capture dial
		window.addEventListener(
			'dragover',
			(e) => {
				const types = e.dataTransfer?.types ?? [];
				if (!types.includes('application/x-fractalgrab')) {
					e.preventDefault();
				}
			},
			true
		);
	});

	function clearSearch() {
		setSearch('');
		setColor(null);
		clearAiSearch();
	}

	function toggleColour(hex: string) {
		const next = ui.activeColorSearch === hex ? null : hex;
		setColor(next);
		colorSearchOpen = false;
		if (next) toast(`Showing ${colorName(hex)} items`, 'info');
	}

	function tagSelected() {
		const t = tagForBatch.trim().toLowerCase();
		if (!t) return;
		for (const id of batchSelection) {
			const item = manifest.items.find((i) => i.id === id);
			if (item && !item.tags.includes(t)) item.tags = [...item.tags, t];
		}
		persist();
		tagForBatch = '';
		toast(`Tagged ${batchSelection.size} item${batchSelection.size > 1 ? 's' : ''}`, 'success');
	}

	function favouriteSelected(v: boolean) {
		for (const id of batchSelection) {
			const item = manifest.items.find((i) => i.id === id);
			if (item) item.favourite = v;
		}
		batchSelection.clear();
		toast('Done', 'success');
	}

	function fileSelected(colId: string | null) {
		for (const id of batchSelection) {
			const item = manifest.items.find((i) => i.id === id);
			if (!item) continue;
			if (colId) {
				if (!item.collectionIds.includes(colId)) item.collectionIds = [...item.collectionIds, colId];
			}
		}
		batchSelection.clear();
		batchCollectionOpen = false;
		toast('Filed', 'success');
	}

	async function aiSearchNow() {
		await runAiSearch();
	}

	function dragOverWindow(e: DragEvent) {
		e.preventDefault();
	}
</script>

<svelte:window on:dragover={dragOverWindow} />

<div class="appshell">
	{#if ui.loading}
		<div class="empty grow">
			<div class="brand-mark" style="animation: pulse 1.2s ease-in-out infinite;"></div>
			<p class="text-muted">Opening your library…</p>
		</div>
	{:else}

		<div class="row grow min-h-0">
			<aside class="box shrink-0 min-h-0 bg-surface border-right gap16" style="width:250px;">
	<div class="row ycenter gap16 pad8">
		<div style="position:relative;">
			<button
				class="button is-icon"
				title="Search by colour"
				onclick={() => (colorSearchOpen = !colorSearchOpen)}
			>
				<Palette size={16}/>
			</button>
			{#if colorSearchOpen}
				<div
					style="position:absolute; right:0; top:36px; background:var(--bg-surface); border:1px solid var(--border); border-radius:12px; padding:10px; box-shadow:var(--shadow-lg); z-index:50; width:220px;"
				>
					<div class="chips">
						{#each paletteChips as hex}
							<button
								class="color-dot"
								style="width:22px; height:22px; background:{hex}; {ui.activeColorSearch ===
								hex
									? 'outline: 2px solid var(--theme);'
									: ''}"
								title={colorName(hex)}
								onclick={() => toggleColour(hex)}
							></button>
						{/each}
					</div>
					{#if !paletteChips.length}
						<p class="text-xs text-muted" style="margin:0;">
							Save images to build a colour palette.
						</p>
					{/if}
				</div>
			{/if}
		</div>
		<button class="button is-icon" onclick={openCapture}>
			<Plus size={16} />
		</button>
		<button class="button is-icon" onclick={openSettings}>
			<Settings size={16} />
		</button>
	</div>
	<div class="row search-input ycenter gap8">
		<Search size={16} />
		<input
			id="app-search"
			placeholder=""
			value={ui.searchQuery}
			oninput={(e) => {
				setSearch(e.currentTarget.value);
				clearAiSearch();
			}}
			onkeydown={(e) => {
				if (e.key === "Enter" && !e.shiftKey) aiSearchNow();
			}}
		/>
		{#if ui.searchQuery || ui.activeColorSearch}
			<button
				class="button"
				data-variant="icon"
				onclick={clearSearch}
				title="Clear search"
			>
				<X size={16} />
			</button>
		{/if}
		{#if aiReady()}
			<button
				class="button"
				data-variant="quiet"
				data-size="sm"
				onclick={aiSearchNow}
				disabled={ui.busy || !ui.searchQuery.trim()}
				title="Full-sentence AI search"
			>
				<Sparkles size={12} /> AI
			</button>
		{/if}
	</div>
				{#if manifest.settings.view === 'notes'}
					<NotesSidebar />
				{:else}
					<CollectionTree />
				{/if}
			</aside>
			<main class="box grow min-w-0">
				<div class="toolbar">
					{#if manifest.settings.view === 'notes'}
						<span class="text-xs fw600">
							{notesUi.activeVault?.name ?? 'Notes'}
							{#if notesUi.activeTab}
								<span class="text-muted"> · {notesUi.activeTab.name}</span>
							{/if}
						</span>
					{:else}
						<span class="text-xs fw600">
							{collectionName(ui.selectedCollectionId)}
							{#if ui.searchQuery}
								<span class="text-muted"> · “{ui.searchQuery}”</span>
							{/if}
							{#if ui.activeColorSearch}
								<span class="text-muted"> · colour {colorName(ui.activeColorSearch)}</span>
							{/if}
						</span>
					{/if}

					<span style="flex:1;"></span>

					<div class="view-switch">
						{#each views as v (v.mode)}
							<button class="view-btn" data-state={manifest.settings.view === v.mode ? 'active' : 'idle'} onclick={() => (manifest.settings.view = v.mode)}>
								<v.icon size={14} /> {v.label}
							</button>
						{/each}
					</div>
				</div>
				{#if manifest.settings.view !== 'notes' && ui.untrackedFiles.length}
					<div class="row ycenter gap8" style="padding: 6px 16px; background: color-mix(in srgb, var(--feedback-info) 10%, transparent); border-bottom: 1px solid var(--border); flex-wrap: wrap;">
						<span class="text-xs text-muted">{ui.untrackedFiles.length} file{ui.untrackedFiles.length > 1 ? 's' : ''} found in your library folder</span>
						{#each ui.untrackedFiles.slice(0, 5) as f (f.name)}
							<button class="badge border tag gap4" style="cursor:pointer;" onclick={() => importUntracked(f.name)} title="Import into library">
								<Upload size={11} /> {f.name}
							</button>
						{/each}
						{#if ui.untrackedFiles.length > 5}
							<span class="text-xs text-muted">+{ui.untrackedFiles.length - 5} more</span>
						{/if}
					</div>
				{/if}
				{#if manifest.settings.view !== 'notes' && batchSelection.size}
					<div class="row ycenter gap8" style="padding: 8px 16px; background: color-mix(in srgb, var(--theme) 8%, transparent); border-bottom: 1px solid var(--border); flex-wrap: wrap;">
						<span class="text-xs fw600">{batchSelection.size} selected</span>
						<div style="position:relative;">
							<button class="button" data-variant="quiet" data-size="sm" onclick={() => (batchCollectionOpen = !batchCollectionOpen)}>File to collection…</button>
							{#if batchCollectionOpen}
								<div class="box" style="position:absolute; top:30px; left:0; background:var(--bg-surface); border:1px solid var(--border); border-radius:10px; padding:8px; box-shadow:var(--shadow-lg); z-index:40; min-width:170px;">
									{#each manifest.collections as col (col.id)}
										<button class="nav-item" onclick={() => fileSelected(col.id)}>
											<Icon name={col.icon ?? 'folder'} size={14} /> {col.name}
										</button>
									{/each}
									<button class="nav-item" onclick={() => fileSelected(null)}>All items (clear)</button>
								</div>
							{/if}
						</div>
						<input placeholder="Tag…" bind:value={tagForBatch} style="width:110px; padding:4px 8px; font-size:12px;" onkeydown={(e) => e.key === 'Enter' && tagSelected()} />
						<button class="button" data-variant="quiet" data-size="sm" onclick={tagSelected}>Tag</button>
						<button class="button" data-variant="quiet" data-size="sm" onclick={() => favouriteSelected(true)}><Star size={12} /> Favourite</button>
						<button class="button" data-variant="danger" data-size="sm" onclick={() => deleteItems([...batchSelection])}><Trash2 size={12} /> Delete</button>
						<button class="button" data-variant="icon" onclick={() => batchSelection.clear()}><X size={14} /></button>
					</div>
				{/if}
				<div class="content">
					{#if manifest.settings.view === 'notes'}
						<NotesView />
					{:else if manifest.settings.view === 'canvas'}
						<CanvasView />
					{:else}
						<Views />
					{/if}
				</div>
			</main>
			{#if manifest.settings.view !== 'notes' && ui.selectedItemId}
				<ItemDetail />
			{/if}
		</div>
	{/if}
</div>

<CapturePanel />
<SettingsDialog />
<DragDial />
<ContextMenu />
<Toasts />
