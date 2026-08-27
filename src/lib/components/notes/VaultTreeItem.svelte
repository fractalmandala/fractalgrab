<script lang="ts">
	import { ChevronDown, ChevronRight, File as FileIcon } from '@lucide/svelte';
	import Icon from '../Icon.svelte';
	import type { VaultNode } from '$lib/types';
	import {
		notesUi,
		toggleFolder,
		openPath,
		renameEntry,
		cutEntry,
		copyEntry,
		deleteEntry,
		setRenamingPath
	} from '$lib/notes/notes.svelte';

	let { node, path, depth = 0 }: { node: VaultNode; path: string; depth?: number } = $props();

	const isExpanded = $derived(notesUi.expanded.has(path));

	// --- file row (inline leaf) ---

	function fileRow(fname: string) {
		const childPath = `${path}/${fname}`;
		return { childPath, fname };
	}
</script>

<!-- directory row -->
<div
	class="vault-row"
	data-state={notesUi.clipboard?.path === path && notesUi.clipboard?.cut ? 'cut' : 'idle'}
	style="padding-left: {6 + depth * 14}px;"
	data-vault-path={path}
	data-vault-dir="true"
	role="treeitem"
	tabindex="0"
	aria-expanded={isExpanded}
	onclick={(e) => {
		e.stopPropagation();
		toggleFolder(path);
	}}
	onkeydown={(e) => {
		if (notesUi.renamingPath === path) return;
		if (e.key === 'Enter' || e.key === ' ') toggleFolder(path);
		else if (e.key === 'F2') setRenamingPath(path);
		else if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			void deleteEntry(path, true);
		} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') copyEntry(path, true);
		else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x') cutEntry(path, true);
	}}
>
	<button
		class="button"
		data-variant="icon"
		style="padding:2px;"
		onclick={(e) => {
			e.stopPropagation();
			toggleFolder(path);
		}}
	>
		{#if isExpanded}<ChevronDown size={13} />{:else}<ChevronRight size={13} />{/if}
	</button>
	<Icon name={isExpanded ? 'folder-open' : 'folder'} size={14} style="flex-shrink:0;" />
	{#if notesUi.renamingPath === path}
		<input
			class="grow"
			style="min-width:0; padding:1px 6px; font-size:12px;"
			value={node.name}
			autofocus
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					const v = (e.currentTarget as HTMLInputElement).value;
					setRenamingPath(null);
					void renameEntry(path, v);
				}
				if (e.key === 'Escape') setRenamingPath(null);
			}}
			onblur={(e) => {
				const v = (e.currentTarget as HTMLInputElement).value;
				setRenamingPath(null);
				void renameEntry(path, v);
			}}
			onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
		/>
	{:else}
		<span class="grow truncate">{node.name}</span>
	{/if}
</div>

{#if isExpanded}
	{#each node.dirs as child (child.name)}
		<svelte:self node={child} path={`${path}/${child.name}`} depth={depth + 1} />
	{/each}
	{#each node.files as fname (fname)}
		{@const file = fileRow(fname)}
		<div
			class="vault-row"
			data-state={notesUi.clipboard?.path === file.childPath && notesUi.clipboard?.cut ? 'cut' : 'idle'}
			style="padding-left: {6 + (depth + 1) * 14}px;"
			data-vault-path={file.childPath}
			data-vault-dir="false"
			role="treeitem"
			tabindex="0"
			onclick={() => void openPath(file.childPath, true)}
			onkeydown={(e) => {
				if (notesUi.renamingPath === file.childPath) return;
				if (e.key === 'Enter') void openPath(file.childPath, true);
				else if (e.key === 'F2') setRenamingPath(file.childPath);
				else if (e.key === 'Delete' || e.key === 'Backspace') {
					e.preventDefault();
					void deleteEntry(file.childPath, false);
				} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') copyEntry(file.childPath, false);
				else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x') cutEntry(file.childPath, false);
			}}
		>
			<span style="width:24px; flex-shrink:0;"></span>
			<FileIcon size={13} style="flex-shrink:0; color: var(--text-muted);" />
			{#if notesUi.renamingPath === file.childPath}
				<input
					class="grow"
					style="min-width:0; padding:1px 6px; font-size:12px;"
					value={fname}
					autofocus
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							const v = (e.currentTarget as HTMLInputElement).value;
							setRenamingPath(null);
							void renameEntry(file.childPath, v);
						}
						if (e.key === 'Escape') setRenamingPath(null);
					}}
					onblur={(e) => {
						const v = (e.currentTarget as HTMLInputElement).value;
						setRenamingPath(null);
						void renameEntry(file.childPath, v);
					}}
					onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
				/>
			{:else}
				<span class="grow truncate">{fname}</span>
			{/if}
		</div>
	{/each}
{/if}

<style>
	.vault-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding-top: 2px;
		padding-bottom: 2px;
		padding-right: 8px;
		font-size: 13px;
		color: var(--text-primary);
		cursor: pointer;
		border-radius: var(--radius-6);
		white-space: nowrap;
		user-select: none;
	}
	.vault-row:hover {
		background: var(--bg-raised);
	}
	.vault-row:focus-visible {
		outline: 2px solid var(--theme);
		outline-offset: -2px;
	}
	.vault-row[data-state='cut'] {
		opacity: 0.45;
	}
</style>
