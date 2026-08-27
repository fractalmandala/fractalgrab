<script lang="ts">
	import { Star } from '@lucide/svelte';
	import Icon from './Icon.svelte';
	import type { Item } from '../types';
	import { autoColorItem, batchSelection, cardImageUrl, setFavourite, toast, toggleSelect, ui } from '../store.svelte';
	import { colorName, readableOn, withAlpha } from '../color';

	let {
		item,
		mode = 'cards',
		inBatch = false
	}: { item: Item; mode?: 'moodboard' | 'cards'; inBatch?: boolean } = $props();

	const imageUrl = $derived(cardImageUrl(item));
	const palette = $derived(item.colors ?? []);
	const backdrop = $derived(
		palette.length
			? `linear-gradient(135deg, ${withAlpha(palette[0], 0.5)}, ${withAlpha(palette[Math.min(1, palette.length - 1)], 0.9)})`
			: ''
	);
	const monogram = $derived(item.title.trim().charAt(0).toUpperCase() || '?');
	const host = $derived(item.url ? safeHost(item.url) : '');

	function safeHost(u: string): string {
		try {
			return new URL(u).host.replace('www.', '');
		} catch {
			return '';
		}
	}
	const selected = $derived(ui.selectedItemId === item.id);
	const isBatch = $derived(batchSelection.has(item.id));

	function onImgLoad() {
		if (!item.colors?.length && item.type === 'image') void autoColorItem(item);
	}

	function copyColor(hex: string, e: MouseEvent) {
		e.stopPropagation();
		navigator.clipboard.writeText(hex).then(() => toast(`${colorName(hex)} — ${hex} copied`, 'success'));
	}

	function onClick(e: MouseEvent) {
		if (e.shiftKey || isBatch || inBatch) {
			if (batchSelection.has(item.id)) batchSelection.delete(item.id);
			else batchSelection.add(item.id);
		} else {
			toggleSelect(item.id);
		}
	}

	function onDragStart(e: DragEvent) {
		e.dataTransfer?.setData('application/x-fractalgrab', item.id);
		e.dataTransfer?.setData('text/plain', item.title);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove';
	}
</script>

<div
	class="item-card"
	data-state={selected ? 'selected' : isBatch ? 'batch' : 'idle'}
	data-item-id={item.id}
	onclick={onClick}
	ondragover={(e) => e.preventDefault()}
	ondrop={(e) => e.preventDefault()}
	draggable="true"
	ondragstart={onDragStart}
	title={item.title}
>
	<div class="item-card-thumb">
		{#if imageUrl}
			{#if backdrop}<div class="backdrop" style="background:{backdrop};"></div>{/if}
			<img src={imageUrl} alt={item.title} loading="lazy" onload={onImgLoad} draggable="false" />
		{:else}
			<div class="monogram" style="background:{backdrop || 'linear-gradient(135deg, #334155, #0f172a)'};">
				<Icon name={item.type === 'link' ? 'link' : item.type === 'note' ? 'file-text' : item.type === 'video' ? 'video' : 'image'} size={mode === 'moodboard' ? 40 : 26} />
			</div>
		{/if}

		{#if item.favourite}
			<div class="fav"><Star size={14} fill="currentColor" /></div>
		{/if}

		{#if palette.length}
			<div class="item-card-colors" style="position:absolute; bottom:6px; left:8px; z-index:2;">
				{#each palette.slice(0, 3) as hex}
					<button
						class="color-dot"
						style="background:{hex};"
						title="{colorName(hex)} ({hex}) — click to copy"
						onclick={(e) => copyColor(hex, e)}
					></button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="item-card-body">
		<div class="item-card-title line-clamp-2">{item.title}</div>
		{#if mode === 'moodboard'}
			{#if item.note}
				<div class="text-xs text-muted line-clamp-2">{item.note}</div>
			{/if}
		{/if}
		<div class="row gap4 text-xs text-muted">
			{#if host}<span>{host}</span>{:else}<span>{item.type}</span>{/if}
			<span style="margin-left:auto; display:flex; gap:4px;">
				{#if item.tags?.length}
					<span>{item.tags.length} tag{item.tags.length > 1 ? 's' : ''}</span>
				{/if}
				<button
					class="button"
					data-variant="icon"
					style="padding:2px; color:{item.favourite ? 'var(--amber-500)' : 'var(--text-muted)'};"
					title="Toggle favourite"
					onclick={(e) => {
						e.stopPropagation();
						setFavourite(item.id, !item.favourite);
					}}
				>
					<Star size={13} fill={item.favourite ? 'currentColor' : 'none'} />
				</button>
			</span>
		</div>
	</div>
</div>
