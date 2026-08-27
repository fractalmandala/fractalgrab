<script lang="ts">
	import Icon from '../Icon.svelte';
	import VaultTree from './VaultTree.svelte';
	import { notesUi, addVault, removeVault, setActiveVault, refreshTree } from '$lib/notes/notes.svelte';

	function onPick(e: Event) {
		const id = (e.currentTarget as HTMLSelectElement).value;
		if (id) void setActiveVault(id);
	}
</script>

<div class="box col grow min-h-0">
	<div class="row ycenter gap8" style="padding: 8px 10px; border-bottom: 1px solid var(--border);">
		<Icon name="library" size={14} />
		<select
			class="grow"
			style="font-size:12px; padding:3px 6px; border-radius: var(--radius-6); background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border);"
			value={notesUi.activeVaultId ?? ''}
			onchange={onPick}
			aria-label="Active vault"
		>
			<option value="">No vault</option>
			{#each notesUi.vaults as v (v.id)}
				<option value={v.id} disabled={!v.exists}>
					{v.name}{v.exists ? '' : ' — missing'}
				</option>
			{/each}
		</select>
		<button class="button" data-variant="icon" title="Add vault…" onclick={() => void addVault()}>
			<Icon name="plus" size={14} />
		</button>
		{#if notesUi.activeVaultId}
			<button
				class="button"
				data-variant="icon"
				title="Remove vault (files stay on disk)"
				onclick={() => {
					if (confirm('Remove this vault from the app? Its files stay on disk.')) void removeVault(notesUi.activeVaultId!);
				}}
			>
				<Icon name="x" size={14} />
			</button>
			<button class="button" data-variant="icon" title="Refresh vault" onclick={() => void refreshTree()}>
				<Icon name="refresh" size={14} />
			</button>
		{/if}
	</div>

	<VaultTree />
</div>
