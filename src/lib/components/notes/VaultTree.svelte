<script lang="ts">
	import Icon from '../Icon.svelte';
	import VaultTreeItem from './VaultTreeItem.svelte';
	import {
		notesUi,
		refreshTree,
		openPath,
		renameEntry,
		cutEntry,
		copyEntry,
		deleteEntry,
		setRenamingPath
	} from '$lib/notes/notes.svelte';

	const vault = $derived(notesUi.activeVault);

	function fileKeydown(e: KeyboardEvent, fpath: string) {
		if (notesUi.renamingPath === fpath) return;
		if (e.key === 'Enter') void openPath(fpath, true);
		else if (e.key === 'F2') setRenamingPath(fpath);
		else if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			void deleteEntry(fpath, false);
		} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') copyEntry(fpath, false);
		else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x') cutEntry(fpath, false);
	}
</script>

<div class="box grow min-h-0">
	{#if !vault}
		<div class="empty grow" style="gap:8px;">
			<p class="text-xs text-muted">No vault selected.</p>
		</div>
	{:else if notesUi.treeLoading}
		<div class="empty grow" style="gap:8px;">
			<div class="brand-mark" style="animation: pulse 1.2s ease-in-out infinite; width:18px; height:18px;"></div>
			<p class="text-xs text-muted">Scanning vault…</p>
		</div>
	{:else if notesUi.treeError}
		<div class="empty grow" style="gap:8px; padding: 12px;">
			<Icon name="shield" size={16} />
			<p class="text-xs text-muted" style="text-align:center;">Folder missing or unreadable.</p>
			<button class="button" data-variant="quiet" data-size="sm" onclick={() => void refreshTree()}>
				<Icon name="refresh" size={12} /> Try again
			</button>
		</div>
	{:else if notesUi.tree}
		<div class="box grow min-h-0" style="overflow-y:auto; padding:6px 4px;">
			{#each notesUi.tree.dirs as dir (dir.name)}
				<VaultTreeItem node={dir} path={`${vault.path}/${dir.name}`} depth={0} />
			{/each}
			{#each notesUi.tree.files as fname (fname)}
				{@const fpath = `${vault.path}/${fname}`}
				<div
					class="vault-row"
					data-state={notesUi.clipboard?.path === fpath && notesUi.clipboard?.cut ? 'cut' : 'idle'}
					style="padding-left: 6px;"
					data-vault-path={fpath}
					data-vault-dir="false"
					role="treeitem" aria-selected="false"
					tabindex="0"
					aria-level="1"
					onclick={() => void openPath(fpath, true)}
					onkeydown={(e) => fileKeydown(e, fpath)}
				>
					<span style="width:24px; flex-shrink:0;"></span>
					<Icon name="file" size={13} style="flex-shrink:0; color: var(--text-muted);" />
					{#if notesUi.renamingPath === fpath}
						<input
							class="grow"
							style="min-width:0; padding:1px 6px; font-size:12px;"
							value={fname}
							onclick={(e) => e.stopPropagation()}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									const v = (e.currentTarget as HTMLInputElement).value;
									setRenamingPath(null);
									void renameEntry(fpath, v);
								}
								if (e.key === 'Escape') setRenamingPath(null);
							}}
							onblur={(e) => {
								const v = (e.currentTarget as HTMLInputElement).value;
								setRenamingPath(null);
								void renameEntry(fpath, v);
							}}
							onfocus={(e) => (e.currentTarget as HTMLInputElement).select()}
						/>
					{:else}
						<span class="grow truncate">{fname}</span>
					{/if}
				</div>
			{/each}
			{#if !notesUi.tree.dirs.length && !notesUi.tree.files.length}
				<div class="empty grow" style="gap:8px;">
					<p class="text-xs text-muted">This vault is empty. Right-click to create a note or folder.</p>
				</div>
			{/if}
		</div>
	{/if}
</div>

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
