<script lang="ts">
	import { Clock, Layers, Plus, Star } from '@lucide/svelte';
	import TreeItem from './TreeItem.svelte';
	import { rootCollections, manifest, addCollection, updateCollection, toast, setCollection, ui } from '../store.svelte';
	import { suggestIcon } from '../iconSuggest';

	let creating = $state(false);
	let createName = $state('');
	let input = $state<HTMLInputElement>();

	function commitCreate() {
		const name = createName.trim();
		if (name) {
			const col = addCollection(name, null);
			updateCollection(col.id, { icon: suggestIcon(name) });
			setCollection(col.id);
			toast(`Collection "${name}" created`, 'success');
		}
		creating = false;
		createName = '';
	}
</script>

<div class="box grow min-h-0">
	<div class="box gap8 padleft8 padright8">
		<button class="nav-item" class:active={ui.selectedCollectionId === null} onclick={() => setCollection(null)}>
			<Layers size={14} /> All items
			<span class="nav-item-count">{manifest.items.length}</span>
		</button>
		<button class="nav-item" data-state={ui.selectedCollectionId === '__fav__' ? 'active' : 'idle'} onclick={() => setCollection('__fav__')}>
			<Star size={15} /> Favourites
		</button>
		<button class="nav-item" data-state={ui.selectedCollectionId === '__recent__' ? 'active' : 'idle'} onclick={() => setCollection('__recent__')}>
			<Clock size={15} /> Recent
		</button>
	</div>

	<div class="sidebar-header" style="margin-top: 6px;">
		<span>Collections</span>
	</div>

	<div class="sidebar-scroll scroll">
		{#each rootCollections() as col (col.id)}
			<TreeItem {col} />
		{/each}

		{#if creating}
			<div class="row ycenter gap8" style="padding: 4px 8px;">
				<input
					bind:this={input}
					bind:value={createName}
					placeholder="Collection name"
					style="flex:1;"
					onkeydown={(e) => {
						if (e.key === 'Enter') commitCreate();
						if (e.key === 'Escape') creating = false;
					}}
				/>
				<button class="button" data-variant="icon" onclick={commitCreate} title="Create">✓</button>
				<button class="button" data-variant="icon" onclick={() => (creating = false)} title="Cancel">✕</button>
			</div>
		{:else}
			<div class="row ycenter gap8" style="padding: 4px 8px;">
				<button class="nav-item" onclick={() => { creating = true; setTimeout(() => input?.focus(), 10); }}>
					<Plus size={14} /> New collection
				</button>
			</div>
		{/if}
	</div>
</div>
