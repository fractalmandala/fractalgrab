<script lang="ts">
	import { X } from '@lucide/svelte';
	import { notesUi, activateTab, requestCloseTab } from '$lib/notes/notes.svelte';

	function keydown(e: KeyboardEvent, id: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			activateTab(id);
		} else if (e.key === 'Escape') {
			(e.currentTarget as HTMLElement).blur();
		}
	}
</script>

<div class="tabbar" role="tablist" aria-label="Open documents">
	{#each notesUi.tabs as tab (tab.id)}
		<button
			class="tab"
			data-state={notesUi.activeTabId === tab.id ? 'active' : 'idle'}
			role="tab"
			aria-selected={notesUi.activeTabId === tab.id}
			title={tab.path}
			onclick={() => activateTab(tab.id)}
			onkeydown={(e) => keydown(e, tab.id)}
		>
			<span class="tab-name truncate">
				{#if tab.missing}
					<span class="tab-warn" title={tab.readError ?? 'File missing'}>⚠</span>
				{/if}
				{tab.name}
			</span>
			{#if tab.dirty}<span class="dot" title="Unsaved changes"></span>{/if}
			{#if tab.conflict}<span class="dot conflict" title="Changed on disk — save to resolve"></span>{/if}
			<span
				class="tab-close"
				role="button"
				aria-label="Close {tab.name}"
				onclick={(e) => {
					e.stopPropagation();
					requestCloseTab(tab.id);
				}}
			>
				<X size={12} />
			</span>
		</button>
	{/each}
	{#if !notesUi.tabs.length}
		<span class="text-xs text-muted" style="padding:0 10px;">No documents open</span>
	{/if}
</div>

<style>
	.tabbar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 8px 0;
		border-bottom: 1px solid var(--border);
		background: var(--bg-surface);
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
		flex-shrink: 0;
	}
	.tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 8px;
		max-width: 200px;
		border-radius: var(--radius-6) var(--radius-6) 0 0;
		font-size: 12px;
		color: var(--text-secondary);
		cursor: pointer;
		border-bottom: 2px solid transparent;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.tab:hover {
		background: var(--bg-raised);
	}
	.tab[data-state='active'] {
		color: var(--text-primary);
		background: var(--bg-raised);
		border-bottom-color: var(--theme);
	}
	.tab-name {
		flex: 1;
		min-width: 0;
	}
	.tab-warn {
		color: #d97706;
		margin-right: 2px;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--theme);
		flex-shrink: 0;
	}
	.dot.conflict {
		background: #d97706;
	}
	.tab-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border-radius: var(--radius-4);
		color: var(--text-muted);
	}
	.tab-close:hover {
		background: var(--border);
		color: var(--text-primary);
	}
</style>
