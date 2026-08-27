<script lang="ts">
	import Icon from '../Icon.svelte';
	import EditorTabs from './EditorTabs.svelte';
	import RawEditor from './RawEditor.svelte';
	import RichEditor from './RichEditor.svelte';
	import {
		notesUi,
		setTabView,
		flushTab,
		openExternal,
		resolveConflict,
		resolveCloseTab,
		createInFolder
	} from '$lib/notes/notes.svelte';

	const tab = $derived(notesUi.activeTab);
	const activeVault = $derived(notesUi.activeVault);

	function saveNow() {
		if (tab) void flushTab(tab.id, 'manual');
	}

	function conflictChoice(choice: 'overwrite' | 'reload' | 'cancel') {
		if (tab) resolveConflict(tab.id, choice);
	}

	function closeChoice(choice: 'save' | 'discard' | 'cancel') {
		if (tab) resolveCloseTab(tab.id, choice);
	}
</script>

<div class="box col grow min-h-0">
	<EditorTabs />

	{#if !tab}
		<div class="empty grow" style="gap:10px;">
			<Icon name="sticky-note" size={26} />
			<p class="text-sm" style="margin:0;">Notes</p>
			<p class="text-xs text-muted" style="max-width:340px; text-align:center;">
				{activeVault
					? 'Pick a document from the vault, or open any Markdown file from disk.'
					: 'Add a vault to browse its Markdown documents, or open any Markdown file from disk.'}
			</p>
			<div class="row ycenter gap8">
				<button class="button" data-variant="quiet" data-size="sm" onclick={() => void openExternal()}>
					<Icon name="file-text" size={13} /> Open file…
				</button>
				{#if activeVault}
					<button
						class="button"
						data-variant="quiet"
						data-size="sm"
						onclick={() => createInFolder(activeVault.path, 'note')}
					>
						<Icon name="file-plus" size={13} /> New note
					</button>
				{/if}
			</div>
		</div>
	{:else if tab.missing}
		<div class="empty grow" style="gap:10px;">
			<Icon name="shield" size={24} />
			<p class="text-sm" style="margin:0;">{tab.name}</p>
			<p class="text-xs text-muted" style="max-width:360px; text-align:center;">
				{tab.readError ?? 'This file is missing or cannot be read.'}
			</p>
			<p class="text-xs text-muted" style="max-width:360px; text-align:center;">
				It cannot be saved until it exists again at its original path.
			</p>
		</div>
	{:else}
		<div class="row ycenter gap8" style="padding: 6px 10px; border-bottom: 1px solid var(--border); flex-shrink:0;">
			<span class="text-xs fw600 truncate" style="max-width:40%;" title={tab.path}>{tab.name}</span>
			{#if tab.inVault}
				<span class="text-xs text-muted truncate" style="max-width:30%;">{tab.path.slice(0, tab.path.lastIndexOf('/'))}</span>
			{:else}
				<span class="badge border tag" style="font-size:10px;">outside vault</span>
			{/if}

			<span style="flex:1;"></span>

			<div class="view-switch" role="group" aria-label="Editor view">
				<button
					class="view-btn"
					data-state={tab.view === 'raw' ? 'active' : 'idle'}
					onclick={() => setTabView(tab.id, 'raw')}
				>
					Raw
				</button>
				<button
					class="view-btn"
					data-state={tab.view === 'rich' ? 'active' : 'idle'}
					onclick={() => setTabView(tab.id, 'rich')}
				>
					Rich
				</button>
			</div>

			<button
				class="button"
				data-variant={tab.conflict ? 'danger' : 'primary'}
				data-size="sm"
				disabled={!tab.dirty}
				onclick={saveNow}
				title={tab.conflict ? 'Changed on disk — save to resolve' : 'Save (⌘S)'}
			>
				{tab.conflict ? 'Resolve conflict' : tab.dirty ? 'Save' : 'Saved'}
			</button>
		</div>

		{#key tab.id + tab.view}
			<div class="box grow min-h-0">
				{#if tab.view === 'raw'}
					<RawEditor tabId={tab.id} />
				{:else}
					<RichEditor tabId={tab.id} />
				{/if}
			</div>
		{/key}
	{/if}
</div>

{#if notesUi.conflictTabId && tab}
	<div class="overlay">
		<div class="panel" style="width:min(400px, 90vw);">
			<div class="panel-header">
				<h2 class="text-md" style="margin:0;">File changed on disk</h2>
			</div>
			<div class="panel-body">
				<p class="text-xs" style="margin:0 0 14px; line-height:1.6;">
					“{tab.name}” was modified outside FractalGrab. Overwrite the file on disk, or reload to
					discard your unsaved changes.
				</p>
				<div class="row ycenter xright gap8">
					<button class="button" data-variant="quiet" onclick={() => conflictChoice('cancel')}>Cancel</button>
					<button class="button" data-variant="quiet" onclick={() => conflictChoice('reload')}>Reload</button>
					<button class="button" data-variant="danger" onclick={() => conflictChoice('overwrite')}>Overwrite</button>
				</div>
			</div>
		</div>
	</div>
{/if}

{#if notesUi.closeTabId && tab}
	<div class="overlay">
		<div class="panel" style="width:min(400px, 90vw);">
			<div class="panel-header">
				<h2 class="text-md" style="margin:0;">Close “{tab.name}”?</h2>
			</div>
			<div class="panel-body">
				<p class="text-xs" style="margin:0 0 14px;">You have unsaved changes in this document.</p>
				<div class="row ycenter xright gap8">
					<button class="button" data-variant="quiet" onclick={() => closeChoice('cancel')}>Cancel</button>
					<button class="button" data-variant="quiet" onclick={() => closeChoice('discard')}>Discard</button>
					<button class="button" data-variant="primary" onclick={() => closeChoice('save')}>Save</button>
				</div>
			</div>
		</div>
	</div>
{/if}
