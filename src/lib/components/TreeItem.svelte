<script lang="ts">
	import { ChevronDown, ChevronRight, Check, MoreHorizontal, Pencil, Plus, Trash2, X } from '@lucide/svelte';
	import Icon from './Icon.svelte';
	import {
		childCollections,
		updateCollection,
		deleteCollection,
		collectionItems,
		moveToCollection,
		addCollection,
		toast,
		setCollection,
		ui
	} from '../store.svelte';
	import { suggestIcon } from '../iconSuggest';
	import type { Collection } from '../types';

	let { col, depth = 0 }: { col: Collection; depth?: number } = $props();

	let expanded = $state(true);
	let creating = $state(false);
	let createName = $state('');
	let editing = $state(false);
	let editName = $state('');
	let menuOpen = $state(false);
	let createInput = $state<HTMLInputElement>();
	let editInput = $state<HTMLInputElement>();

	const children = $derived(childCollections(col.id));
	const active = $derived(ui.selectedCollectionId === col.id);
	const count = $derived(collectionItems(col.id));
	const iconName = $derived(col.icon ?? suggestIcon(col.name));

	function commitCreate() {
		const name = createName.trim();
		if (name) {
			const child = addCollection(name, col.id);
			updateCollection(child.id, { icon: suggestIcon(name) });
			expanded = true;
			setCollection(child.id);
		}
		creating = false;
		createName = '';
	}

	function commitEdit() {
		const name = editName.trim();
		if (name) updateCollection(col.id, { name });
		editing = false;
	}

	function cycleIcon() {
		const icons = ['folder', 'sparkles', 'palette', 'type', 'code', 'book-open', 'image', 'music', 'video', 'map', 'utensils', 'heart', 'rocket', 'globe', 'camera', 'star'];
		const i = icons.indexOf(col.icon ?? 'folder');
		updateCollection(col.id, { icon: icons[(i + 1) % icons.length] });
	}

	function remove() {
		if (confirm(`Delete collection "${col.name}"? Items stay in your library but are removed from it.`)) {
			deleteCollection(col.id);
			if (ui.selectedCollectionId === col.id) setCollection(null);
			toast('Collection deleted', 'success');
		}
	}

	async function dropItem(e: DragEvent) {
		e.preventDefault();
		const id = e.dataTransfer?.getData('application/x-fractalgrab');
		if (id) {
			moveToCollection(id, col.id, true);
			toast(`Filed into "${col.name}"`, 'success');
		}
	}
</script>

<div
	class="nav-item"
	data-state={active ? 'active' : 'idle'}
	style="padding-left: {8 + depth * 14}px;"
	role="button"
	tabindex="0"
	data-col-id={col.id}
	onclick={(e) => {
		e.stopPropagation();
		setCollection(col.id);
	}}
	onkeydown={(e) => e.key === 'Enter' && setCollection(col.id)}
	ondragover={(e) => {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'link';
	}}
	ondrop={dropItem}
>
	{#if children.length}
		<button
			class="button"
			data-variant="icon"
			style="padding:2px;"
			onclick={(e) => {
				e.stopPropagation();
				expanded = !expanded;
			}}
		>
			{#if expanded}<ChevronDown size={13} />{:else}<ChevronRight size={13} />{/if}
		</button>
	{:else}
		<span style="width:17px;"></span>
	{/if}

	<button class="button" data-variant="icon" style="padding:2px;" title="Change icon" onclick={(e) => { e.stopPropagation(); cycleIcon(); }}>
		<Icon name={iconName} size={15} />
	</button>

	{#if editing}
		<input
			bind:this={editInput}
			bind:value={editName}
			style="flex:1; min-width:0;"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Enter') commitEdit();
				if (e.key === 'Escape') editing = false;
			}}
			onblur={commitEdit}
		/>
	{:else}
		<span class="grow truncate">{col.name}</span>
		{#if count > 0}<span class="nav-item-count">{count}</span>{/if}
		<button
			class="button"
			data-variant="icon"
			style="padding:2px;"
			onclick={(e) => {
				e.stopPropagation();
				menuOpen = !menuOpen;
			}}
		>
			<MoreHorizontal size={13} />
		</button>
	{/if}
</div>

{#if menuOpen}
	<div class="row ycenter" style="padding: 2px 8px 6px {44 + depth * 14}px; gap: 4px;">
		<button
			class="button"
			data-variant="quiet"
			data-size="sm"
			onclick={(e) => {
				e.stopPropagation();
				menuOpen = false;
				editName = col.name;
				editing = true;
				setTimeout(() => editInput?.focus(), 10);
			}}
		>
			<Pencil size={12} /> Rename
		</button>
		<button
			class="button"
			data-variant="quiet"
			data-size="sm"
			onclick={(e) => {
				e.stopPropagation();
				menuOpen = false;
				creating = true;
				createName = '';
				setTimeout(() => createInput?.focus(), 10);
			}}
		>
			<Plus size={12} /> Sub
		</button>
		<button
			class="button"
			data-variant="danger"
			data-size="sm"
			onclick={(e) => {
				e.stopPropagation();
				menuOpen = false;
				remove();
			}}
		>
			<Trash2 size={12} /> Delete
		</button>
	</div>
{/if}

{#if creating}
	<div class="row ycenter gap8" style="padding: 4px 8px 4px {44 + depth * 14}px;">
		<input
			bind:this={createInput}
			bind:value={createName}
			placeholder="Sub-collection"
			style="flex:1;"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Enter') commitCreate();
				if (e.key === 'Escape') creating = false;
			}}
		/>
		<button class="button" data-variant="icon" onclick={commitCreate}><Check size={14} /></button>
		<button class="button" data-variant="icon" onclick={() => (creating = false)}><X size={14} /></button>
	</div>
{/if}

{#if expanded}
	{#each children as child}
		<svelte:self col={child} depth={depth + 1} />
	{/each}
{/if}
