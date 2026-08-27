<script lang="ts">
	import { Copy, ExternalLink, Eye, Sparkles, Star, Trash2, Wand2, X } from '@lucide/svelte';
	import Icon from './Icon.svelte';
	import { backend, isTauri } from '../backend';
	import {
		collections,
		deleteItems,
		moveToCollection,
		ocrItem,
		renameTitle,
		runAiArtPrompt,
		runAiRename,
		runAiTag,
		selectedItem,
		setFavourite,
		setNote,
		similarItems,
		toast,
		toggleTag,
		cardImageUrl,
		setSelected
	} from '../store.svelte';
	import { colorName } from '../color';

	const item = $derived(selectedItem());

	let titleDraft = $state('');
	let tagDraft = $state('');
	let noteDraft = $state('');
	let aiPromptResult = $state<string | null>(null);
	let similar = $state<ReturnType<typeof similarItems>>([]);

	$effect(() => {
		if (item) {
			titleDraft = item.title;
			noteDraft = item.note ?? '';
			aiPromptResult = null;
			similar = similarItems(item);
		}
	});

	function addTag() {
		const t = tagDraft.trim().toLowerCase().replace(/[^a-z0-9-_ ]/g, '');
		if (t && item && !item.tags.includes(t)) toggleTag(item.id, t);
		tagDraft = '';
	}

	function copyText(text: string, label: string) {
		navigator.clipboard.writeText(text).then(() => toast(`${label} copied`, 'success'));
	}

	function copyColor(hex: string) {
		copyText(hex, `${colorName(hex)} — ${hex}`);
	}

	function openItem() {
		if (!item) return;
		if (item.url) backend.openItem(undefined, item.url);
		else backend.openItem(item.filename);
	}

	async function artPrompt() {
		if (!item) return;
		aiPromptResult = await runAiArtPrompt(item);
	}

	async function titleBlur() {
		if (!item) return;
		if (titleDraft.trim() && titleDraft !== item.title) {
			await renameTitle(item.id, titleDraft);
		}
	}
</script>

{#if item}
	<div class="box shrink-0 min-h-0 bg-surface border-left" style="width:340px;">
		<div class="detail-preview">
			{#if cardImageUrl(item)}
				<img src={cardImageUrl(item)} alt={item.title} />
			{:else}
				<div
					style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:{item.colors?.[0] ? item.colors[0] : 'var(--bg-raised)'};"
				>
					<Icon name={item.type === 'link' ? 'link' : item.type === 'note' ? 'file-text' : item.type === 'video' ? 'video' : 'image'} size={48} />
				</div>
			{/if}
			<div class="fav" onclick={() => setFavourite(item.id, !item.favourite)} style="cursor:pointer;">
				<Star size={15} fill={item.favourite ? 'currentColor' : 'none'} />
			</div>
		</div>

		<div class="detail-body scroll">
			<div class="field">
				<label>Title</label>
				<input bind:value={titleDraft} onblur={titleBlur} onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
				<div class="row ycenter gap8">
					<button class="button" data-variant="quiet" data-size="sm" onclick={runAiRename.bind(null, item)}>
						<Wand2 size={12} /> AI rename
					</button>
				</div>
			</div>

			{#if item.url}
				<div class="field">
					<label>Link</label>
					<div class="row ycenter gap8">
						<span class="grow text-xs text-muted truncate">{item.url}</span>
						<button class="button" data-variant="icon" title="Open" onclick={openItem}><ExternalLink size={14} /></button>
						<button class="button" data-variant="icon" title="Copy URL" onclick={() => copyText(item.url!, 'URL')}><Copy size={14} /></button>
					</div>
				</div>
			{/if}

			{#if isTauri()}
				<div class="field">
					<label>File</label>
					<div class="row ycenter gap8">
						<span class="grow text-xs text-muted truncate">{item.filename}</span>
						<button class="button" data-variant="icon" title="Reveal in Finder" onclick={() => backend.revealInFinder(item.filename)}><Eye size={14} /></button>
						<button class="button" data-variant="icon" title="Open file" onclick={() => backend.openItem(item.filename)}><ExternalLink size={14} /></button>
					</div>
				</div>
			{/if}

			<div class="field">
				<label>Collections</label>
				<div class="chips">
					{#each collections() as col (col.id)}
						<button
							class="badge border tag gap4"
							style="cursor:pointer; {item.collectionIds.includes(col.id) ? 'background: color-mix(in srgb, var(--theme) 18%, transparent); color: var(--theme);' : ''}"
							onclick={() => moveToCollection(item.id, col.id, !item.collectionIds.includes(col.id))}
						>
							<Icon name={col.icon ?? 'folder'} size={12} /> {col.name}
						</button>
					{/each}
					{#if !collections().length}
						<span class="text-xs text-muted">Create collections in the sidebar, then file items into them.</span>
					{/if}
				</div>
			</div>

			<div class="field">
				<label>Tags</label>
				<div class="chips">
					{#each item.tags ?? [] as tag (tag)}
						<span class="badge border tag gap4">
							{tag}
							<button onclick={() => toggleTag(item.id, tag)} title="Remove tag">✕</button>
						</span>
					{/each}
					{#each (item.aiTags ?? []).filter((t) => !(item.tags ?? []).includes(t)) as tag (tag)}
						<span class="badge border tag gap4" style="border-style:dashed;">
							<Sparkles size={10} /> {tag}
							<button onclick={() => toggleTag(item.id, tag)} title="Add AI tag">+</button>
						</span>
					{/each}
				</div>
				<div class="row ycenter gap8">
					<input
						placeholder="Add tag…"
						bind:value={tagDraft}
						style="flex:1;"
						onkeydown={(e) => {
							if (e.key === 'Enter') addTag();
						}}
					/>
					<button class="button" data-variant="quiet" data-size="sm" onclick={runAiTag.bind(null, item)}>
						<Sparkles size={12} /> AI tag
					</button>
				</div>
			</div>

			<div class="field">
				<label>Note</label>
				<textarea rows="4" bind:value={noteDraft} onblur={() => item && setNote(item.id, noteDraft)} placeholder="A free-text note…"></textarea>
			</div>

			{#if item.colors?.length}
				<div class="field">
					<label>Colours</label>
					<div class="chips">
						{#each item.colors as hex (hex)}
							<button
								class="color-dot"
								style="width:22px; height:22px; background:{hex};"
								title="{colorName(hex)} ({hex}) — click to copy"
								onclick={() => copyColor(hex)}
							></button>
						{/each}
					</div>
				</div>
			{/if}

			{#if item.type === 'image'}
				<div class="row ycenter gap8" style="flex-wrap:wrap;">
					<button class="button" data-variant="quiet" data-size="sm" onclick={ocrItem.bind(null, item)}>
						<Icon name="scan-text" size={12} /> Read text (OCR)
					</button>
					<button class="button" data-variant="quiet" data-size="sm" onclick={artPrompt}>
						<Icon name="wand-2" size={12} /> Art prompt
					</button>
				</div>
				{#if item.ocrText}
					<div class="field">
						<label>Text in image</label>
						<p class="text-xs text-muted" style="margin:0; max-height:120px; overflow-y:auto;">{item.ocrText}</p>
					</div>
				{/if}
				{#if aiPromptResult}
					<div class="field">
						<label>Art prompt</label>
						<p class="text-xs" style="margin:0;">{aiPromptResult}</p>
						<button class="button" data-variant="quiet" data-size="sm" onclick={() => copyText(aiPromptResult!, 'Prompt')}>
							<Copy size={12} /> Copy prompt
						</button>
					</div>
				{/if}
			{/if}

			{#if similar.length}
				<div class="field">
					<label>Find similar</label>
					<div class="chips">
						{#each similar as s (s.id)}
							<button
								class="badge border tag gap4"
								style="cursor:pointer;"
								onclick={() => setSelected(s.id)}
								title={s.title}
							>
								<span class="color-dot" style="width:10px; height:10px; background:{s.colors?.[0] ?? '#888'}; display:inline-block;"></span>
								<span class="truncate" style="max-width:120px;">{s.title}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<div class="row ycenter gap8" style="margin-top:auto;">
				<button class="button" data-variant="danger" data-size="sm" onclick={() => deleteItems([item.id])}>
					<Trash2 size={12} /> Delete
				</button>
				<button class="button" data-variant="quiet" data-size="sm" onclick={() => setSelected(null)}>
					<X size={12} /> Close
				</button>
			</div>
		</div>
	</div>
{/if}
