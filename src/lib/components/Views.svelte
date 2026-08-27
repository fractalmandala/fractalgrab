<script lang="ts">
	import { ExternalLink, ImagePlus, Star } from '@lucide/svelte';
	import ItemCard from './ItemCard.svelte';
	import Icon from './Icon.svelte';
	import { backend } from '../backend';
	import {
		filteredItems,
		manifest,
		collectionName,
		setCollection,
		toggleSelect,
		openCapture,
		ui
	} from '../store.svelte';
	import type { Item } from '../types';

	const day = 86400000;

	function formatDate(ts: number): string {
		return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function timeAgo(ts: number): string {
		const diff = Date.now() - ts;
		if (diff < day) return 'today';
		if (diff < 2 * day) return 'yesterday';
		if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
		return formatDate(ts);
	}

	const buckets = $derived.by(() => {
		const groups: { label: string; items: Item[] }[] = [];
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const t = today.getTime();
		for (const item of filteredItems()) {
			const d = item.createdAt;
			let label = '';
			if (d >= t) label = 'Today';
			else if (d >= t - day) label = 'Yesterday';
			else if (d >= t - 7 * day) label = 'This week';
			else if (d >= t - 30 * day) label = 'This month';
			else label = 'Older';
			let g = groups.find((x) => x.label === label);
			if (!g) {
				g = { label, items: [] };
				groups.push(g);
			}
			g.items.push(item);
		}
		return groups;
	});

	const empty = $derived(
		filteredItems().length === 0 &&
			!ui.searchQuery &&
			!ui.activeColorSearch &&
			ui.selectedCollectionId !== '__fav__' &&
			ui.selectedCollectionId !== '__recent__'
	);

	function typeIconName(item: Item): string {
		if (item.type === 'link') return 'link';
		if (item.type === 'note') return 'file-text';
		if (item.type === 'video') return 'video';
		return 'image';
	}
</script>

{#snippet rowIcon(item: Item)}
	<div
		style="width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:{item.colors?.[0] ? item.colors[0] + '33' : 'var(--bg-raised)'}; color:{item.colors?.[0] ?? 'var(--text-secondary)'};"
	>
		<Icon name={typeIconName(item)} size={16} />
	</div>
{/snippet}

{#if empty}
	<div class="empty">
		<Icon name="image-plus" size={44} />
		<h3 style="margin:0;">Your library is empty</h3>
		<p class="text-muted">Drag anything in, paste a link, or hit Capture — files land in {manifest.settings.libraryPath}.</p>
		<button class="button" data-variant="primary" onclick={openCapture}>
			<ImagePlus size={16} /> Capture something
		</button>
	</div>
{:else if filteredItems().length === 0}
	<div class="empty">
		<Icon name="search" size={40} />
		<h3 style="margin:0;">Nothing matches</h3>
		<p class="text-muted">No results in {collectionName(ui.selectedCollectionId)}.</p>
		<button class="button" data-variant="quiet" onclick={() => setCollection(null)}>Show all items</button>
	</div>
{:else if manifest.settings.view === 'moodboard' || manifest.settings.view === 'cards'}
	<div class="auto-grid" style="--auto-grid-min: {manifest.settings.view === 'moodboard' ? 240 : 190}px;">
		{#each filteredItems() as item (item.id)}
			<ItemCard {item} mode={manifest.settings.view} />
		{/each}
	</div>
{:else if manifest.settings.view === 'timeline'}
	<div>
		{#each buckets as bucket (bucket.label)}
			<div class="timeline-group">
				<div class="timeline-label">{bucket.label} · {bucket.items.length}</div>
				{#each bucket.items as item (item.id)}
					<div
						class="list-row"
						data-state={ui.selectedItemId === item.id ? 'selected' : 'idle'}
						data-item-id={item.id}
						role="button"
						tabindex="0"
						onclick={() => toggleSelect(item.id)}
						onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSelect(item.id)}
					>
						{@render rowIcon(item)}
						<div style="min-width:0;">
							<div class="fw600 truncate">{item.title}</div>
							<div class="text-xs text-muted">{item.tags?.join(' · ')}</div>
						</div>
						<span class="text-xs text-muted" style="white-space:nowrap;">{timeAgo(item.createdAt)}</span>
					</div>
				{/each}
			</div>
		{/each}
	</div>
{:else}
	<div class="list">
		{#each filteredItems() as item (item.id)}
			<div
				class="list-row"
				data-state={ui.selectedItemId === item.id ? 'selected' : 'idle'}
				data-item-id={item.id}
				role="button"
				tabindex="0"
				onclick={() => toggleSelect(item.id)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleSelect(item.id)}
			>
				{@render rowIcon(item)}
				<div style="min-width:0;">
					<div class="fw600 truncate">{item.title}</div>
					<div class="text-xs text-muted truncate">
						{#if item.url}{item.url}{:else}{item.filename}{/if}
					</div>
				</div>
				{#if item.favourite}
					<Star size={14} fill="currentColor" style="color:var(--amber-500);" />
				{:else}
					<span style="width:14px;"></span>
				{/if}
				<span class="text-xs text-muted" style="white-space:nowrap;">{timeAgo(item.createdAt)}</span>
				<button
					class="button"
					data-variant="icon"
					title="Open"
					onclick={(e) => {
						e.stopPropagation();
						backend.openItem(item.filename, item.url ?? undefined);
					}}
				>
					<ExternalLink size={14} />
				</button>
			</div>
		{/each}
	</div>
{/if}
