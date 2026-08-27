<script lang="ts">
	import Icon from './Icon.svelte';
	import { backend, isTauri } from '../backend';
	import {
		askInput,
		closeAsk,
		closeMenu,
		collections,
		manifest,
		moveToCollection,
		popMenu,
		pushMenu,
		renameTitle,
		rescan,
		setCollection,
		setFavourite,
		showMenu,
		toast,
		updateCollection,
		updateItem,
		addCollection,
		deleteCollection,
		deleteItems,
		cycleCollectionIcon,
		copyImageToClipboard,
		copyTextToClipboard,
		pasteFromClipboard,
		ui,
		type MenuItem
	} from '../store.svelte';
	import { suggestIcon } from '../iconSuggest';
	import { openNotesContextMenu, notesUi } from '../notes/notes.svelte';

	let askValue = $state('');

	$effect(() => {
		if (ui.ask) askValue = ui.ask.initial ?? '';
	});

	function submitAsk() {
		const cb = ui.ask?.onOk;
		const v = askValue;
		closeAsk();
		if (cb) cb(v);
	}

	// -----------------------------------------------------------------------
	// Menu construction
	// -----------------------------------------------------------------------

	function itemMenu(id: string): MenuItem[] {
		const item = manifest.items.find((i) => i.id === id);
		if (!item) return [];
		return [
			{ label: 'Open', icon: 'external-link', action: () => backend.openItem(item.filename, item.url ?? undefined) },
			...(item.url ? [{ label: 'Open URL', icon: 'globe', action: () => backend.openItem(undefined, item.url!) }] : []),
			...(isTauri() ? [{ label: 'Reveal in Finder', icon: 'eye', action: () => backend.revealInFinder(item.filename) }] : []),
			{ separator: true },
			...(item.url ? [{ label: 'Copy URL', icon: 'copy', action: () => copyTextToClipboard(item.url!, 'URL') }] : []),
			{ label: 'Copy title', icon: 'copy', action: () => copyTextToClipboard(item.title, 'Title') },
			...(item.note ? [{ label: 'Copy note', icon: 'copy', action: () => copyTextToClipboard(item.note!, 'Note') }] : []),
			...(item.type === 'image' || item.imageFile
				? [{ label: 'Copy image', icon: 'image', action: () => copyImageToClipboard(item) }]
				: []),
			{ separator: true },
			{
				label: 'Rename…',
				icon: 'pencil',
				action: () => askInput('Rename item', 'New title', item.title, (v) => v.trim() && renameTitle(item.id, v))
			},
			{
				label: item.favourite ? 'Unfavourite' : 'Favourite',
				icon: 'star',
				action: () => setFavourite(item.id, !item.favourite)
			},
			{
				label: 'File to collection',
				icon: 'folder-open',
				children: [
					...collections().map((c) => ({
						label: c.name,
						icon: c.icon ?? 'folder',
						action: () => moveToCollection(item.id, c.id, true)
					})),
					{ label: 'Remove from all collections', icon: 'x', action: () => updateItem(item.id, { collectionIds: [] }) },
					{ separator: true },
					{
						label: 'New collection…',
						icon: 'plus',
						action: () =>
							askInput('New collection', 'Collection name', '', (v) => {
								const name = v.trim();
								if (name) {
									const c = addCollection(name, null);
									updateCollection(c.id, { icon: suggestIcon(name) });
									moveToCollection(item.id, c.id, true);
								}
							})
					}
				]
			},
			{ separator: true },
			{ label: 'Delete', icon: 'trash-2', danger: true, action: () => deleteItems([item.id]) }
		];
	}

	function collectionMenu(id: string): MenuItem[] {
		const col = manifest.collections.find((c) => c.id === id);
		if (!col) return [];
		return [
			{ label: 'Open collection', icon: 'folder-open', action: () => setCollection(col.id) },
			{
				label: 'New sub-collection…',
				icon: 'plus',
				action: () =>
					askInput('New sub-collection', 'Name', '', (v) => {
						const name = v.trim();
						if (name) {
							const c = addCollection(name, col.id);
							updateCollection(c.id, { icon: suggestIcon(name) });
						}
					})
			},
			{
				label: 'Rename…',
				icon: 'pencil',
				action: () => askInput('Rename collection', 'Name', col.name, (v) => v.trim() && updateCollection(col.id, { name: v.trim() }))
			},
			{ label: 'Change icon', icon: 'image', action: () => cycleCollectionIcon(col.id) },
			{ separator: true },
			{
				label: 'Delete collection',
				icon: 'trash-2',
				danger: true,
				action: () => {
					deleteCollection(col.id);
					if (ui.selectedCollectionId === col.id) setCollection(null);
					toast('Collection deleted', 'success');
				}
			}
		];
	}

	function blankMenu(): MenuItem[] {
		return [
			{
				label: 'New collection…',
				icon: 'plus',
				action: () =>
					askInput('New collection', 'Collection name', '', (v) => {
						const name = v.trim();
						if (name) {
							const c = addCollection(name, null);
							updateCollection(c.id, { icon: suggestIcon(name) });
							setCollection(c.id);
						}
					})
			},
			{ label: 'Paste from clipboard', icon: 'clipboard', action: () => pasteFromClipboard() },
			{ label: 'Refresh library', icon: 'refresh', action: () => rescan() }
		];
	}

	function onContextMenu(e: MouseEvent) {
		e.preventDefault();
		const t = e.target as HTMLElement;
		// The editors own their context menu (spellcheck, native CM menu) —
		// never open the vault/library menu over them.
		if (t.closest('.rich-host') || t.closest('.cm-editor')) return;
		const vaultEl = t.closest('[data-vault-path]') as HTMLElement | null;
		const itemEl = t.closest('[data-item-id]') as HTMLElement | null;
		const colEl = t.closest('[data-col-id]') as HTMLElement | null;
		if (vaultEl) {
			const path = vaultEl.dataset.vaultPath!;
			const isDir = vaultEl.dataset.vaultDir === 'true';
			openNotesContextMenu(e.clientX, e.clientY, path, isDir, false);
			return;
		}
		if (manifest.settings.view === 'notes' && notesUi.activeVault) {
			// Blank space while Notes is active → vault-root menu.
			openNotesContextMenu(e.clientX, e.clientY, notesUi.activeVault.path, true, true);
			return;
		}
		let items: MenuItem[] = [];
		if (itemEl) items = itemMenu(itemEl.dataset.itemId!);
		else if (colEl) items = collectionMenu(colEl.dataset.colId!);
		else items = blankMenu();
		showMenu(e.clientX, e.clientY, items);
	}

	function run(item: MenuItem) {
		if (item.separator || item.disabled) return;
		if (item.children?.length) {
			pushMenu(item.label ?? '', item.children);
			return;
		}
		closeMenu();
		item.action?.();
	}

	// clamp the menu inside the viewport
	let posX = $state(0);
	let posY = $state(0);
	let menuEl = $state<HTMLElement>();

	$effect(() => {
		if (ui.menu) {
			posX = ui.menu.x;
			posY = ui.menu.y;
			queueMicrotask(() => {
				if (!menuEl) return;
				const rect = menuEl.getBoundingClientRect();
				if (rect.right > window.innerWidth) posX = Math.max(4, window.innerWidth - rect.width - 4);
				if (rect.bottom > window.innerHeight) posY = Math.max(4, window.innerHeight - rect.height - 4);
			});
		}
	});

	window.addEventListener('contextmenu', onContextMenu, true);
	window.addEventListener(
		'click',
		(e) => {
			if (ui.menu && !(e.target as HTMLElement).closest('.menu')) closeMenu();
		},
		true
	);
	window.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			if (ui.menu) closeMenu();
			else if (ui.ask) closeAsk();
		}
	});
</script>

{#if ui.menu}
	<div
		class="menu"
		bind:this={menuEl}
		style="left:{posX}px; top:{posY}px;"
		role="menu"
		tabindex="-1"
		oncontextmenu={(e) => e.preventDefault()}
	>
		{#if ui.menu.stack.length > 1}
			<button class="menu-item" role="menuitem" onclick={popMenu}>
				<Icon name="chevron-left" size={14} />
				Back
			</button>
			<div class="menu-sep"></div>
		{/if}
		{#each ui.menu.stack[ui.menu.stack.length - 1].items as item, i (i)}
			{#if item.separator}
				<div class="menu-sep"></div>
			{:else}
				<button class="menu-item {item.danger ? 'danger' : ''}" role="menuitem" disabled={item.disabled} onclick={() => run(item)}>
					{#if item.icon}<Icon name={item.icon} size={14} />{/if}
					<span style="flex:1; text-align:left;">{item.label}</span>
					{#if item.children?.length}<span class="text-muted" style="font-size:10px;">▸</span>{/if}
				</button>
			{/if}
		{/each}
	</div>
{/if}

{#if ui.ask}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) closeAsk(); }}>
		<div class="panel" style="width:min(360px, 90vw);">
			<div class="panel-header">
				<h2 class="text-md" style="margin:0;">{ui.ask.title}</h2>
			</div>
			<div class="panel-body">
				<input
					placeholder={ui.ask.placeholder}
					bind:value={askValue}
					onkeydown={(e) => {
						if (e.key === 'Enter') submitAsk();
						if (e.key === 'Escape') closeAsk();
					}}
				/>
				<div class="row ycenter xright gap8">
					<button class="button" data-variant="quiet" onclick={closeAsk}>Cancel</button>
					<button class="button" data-variant="primary" onclick={submitAsk}>{ui.ask.okLabel ?? 'OK'}</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.menu {
		position: fixed;
		z-index: 1000;
		min-width: 190px;
		max-width: 280px;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-12);
		box-shadow: var(--shadow-lg);
		padding: 4px;
		display: flex;
		flex-direction: column;
	}
	.menu-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 10px;
		border-radius: var(--radius-6);
		font-size: var(--text-md);
		color: var(--text-primary);
		cursor: pointer;
	}
	.menu-item:hover {
		background: var(--bg-raised);
	}
	.menu-item.danger {
		color: var(--feedback-danger);
	}
	.menu-item.danger:hover {
		background: color-mix(in srgb, var(--feedback-danger) 12%, transparent);
	}
	.menu-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.menu-sep {
		height: 1px;
		background: var(--border);
		margin: 4px 6px;
	}
</style>
