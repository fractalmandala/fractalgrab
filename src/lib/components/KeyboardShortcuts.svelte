<script lang="ts">
	import { X } from '@lucide/svelte';

	let { open = $bindable(false) }: { open: boolean } = $props();

	const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
	const mod = isMac ? '⌘' : 'Ctrl';

	const sections = [
		{
			title: 'Navigation',
			shortcuts: [
				{ keys: '/', desc: 'Focus search' },
				{ keys: 'Esc', desc: 'Clear search / deselect / close panel' },
			]
		},
		{
			title: 'Actions',
			shortcuts: [
				{ keys: 'C', desc: 'Open capture panel (save a URL)' },
				{ keys: 'Del / ⌫', desc: 'Delete selected item(s)' },
			]
		},
		{
			title: 'Views',
			shortcuts: [
				{ keys: 'Click view buttons', desc: 'Switch between Moodboard, Cards, List, Timeline, Canvas, Notes' },
			]
		},
		{
			title: 'Editor (Raw mode)',
			shortcuts: [
				{ keys: `${mod}+Z`, desc: 'Undo' },
				{ keys: `${mod}+⇧+Z`, desc: 'Redo' },
				{ keys: `${mod}+B`, desc: 'Bold' },
				{ keys: `${mod}+I`, desc: 'Italic' },
			]
		},
		{
			title: 'Notes',
			shortcuts: [
				{ keys: 'Double-click', desc: 'Rename file/folder' },
				{ keys: 'Right-click', desc: 'Context menu (cut, copy, paste, delete, new…)' },
			]
		}
	];

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
		}
	}
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
	<div class="overlay" role="dialog" aria-label="Keyboard shortcuts" tabindex="-1" onclick={() => open = false} onkeydown={(e) => e.key === 'Escape' && (open = false)}>
		<div class="panel" onclick={(e) => e.stopPropagation()}>
			<div class="panel-header">
				<h2>Keyboard Shortcuts</h2>
				<button class="button is-icon" onclick={() => open = false}>
					<X size={16} />
				</button>
			</div>
			<div class="panel-body">
				{#each sections as section}
					<div class="shortcut-section">
						<h3>{section.title}</h3>
						<div class="shortcut-list">
							{#each section.shortcuts as s}
								<div class="shortcut-row">
									<kbd class="shortcut-keys">{s.keys}</kbd>
									<span class="shortcut-desc">{s.desc}</span>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.panel {
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: var(--shadow-lg);
		width: 480px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border);
	}
	.panel-header h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}
	.panel-body {
		padding: 16px 20px;
		overflow-y: auto;
	}
	.shortcut-section {
		margin-bottom: 16px;
	}
	.shortcut-section h3 {
		margin: 0 0 8px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}
	.shortcut-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.shortcut-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.shortcut-keys {
		font-family: monospace;
		font-size: 12px;
		padding: 2px 8px;
		background: var(--bg-sunken);
		border: 1px solid var(--border);
		border-radius: 6px;
		min-width: 60px;
		text-align: center;
		white-space: nowrap;
	}
	.shortcut-desc {
		font-size: 13px;
		color: var(--text);
	}
</style>
