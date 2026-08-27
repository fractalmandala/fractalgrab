<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
	import { EditorState } from '@codemirror/state';
	import { markdown } from '@codemirror/lang-markdown';
	import { defaultKeymap, indentWithTab } from '@codemirror/commands';
	import { notesUi, setSource, undo, redo, flushTab } from '$lib/notes/notes.svelte';

	let { tabId }: { tabId: string } = $props();

	let host = $state<HTMLDivElement>();
	let view: EditorView | null = null;
	let applying = false;

	const tab = $derived(notesUi.tabs.find((t) => t.id === tabId) ?? null);

	const theme = EditorView.theme(
		{
			'&': {
				height: '100%',
				backgroundColor: 'transparent',
				color: 'var(--text-primary)',
				fontSize: '13px'
			},
			'.cm-scroller': {
				fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
				lineHeight: '1.6'
			},
			'.cm-content': {
				caretColor: 'var(--text-primary)',
				padding: '10px 0'
			},
			'.cm-gutters': {
				backgroundColor: 'transparent',
				color: 'var(--text-muted)',
				borderRight: '1px solid var(--border)',
				fontSize: '11px'
			},
			'.cm-activeLine': {
				backgroundColor: 'color-mix(in srgb, var(--bg-raised) 45%, transparent)'
			},
			'.cm-activeLineGutter': {
				backgroundColor: 'transparent'
			},
			'.cm-cursor': {
				borderLeftColor: 'var(--text-primary)'
			},
			'.cm-selectionBackground, .cm-content ::selection': {
				backgroundColor: 'color-mix(in srgb, var(--theme) 28%, transparent) !important'
			}
		},
		{ dark: false }
	);

	onMount(() => {
		if (!host) return;
		const t = notesUi.tabs.find((x) => x.id === tabId);
		view = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: t?.source ?? '',
				extensions: [
					lineNumbers(),
					highlightActiveLine(),
					highlightActiveLineGutter(),
					markdown(),
					EditorView.lineWrapping,
					theme,
					keymap.of([
						{
							key: 'Mod-z',
							run: () => {
								undo(tabId);
								return true;
							}
						},
						{
							key: 'Mod-y',
							run: () => {
								redo(tabId);
								return true;
							}
						},
						{
							key: 'Mod-Shift-z',
							run: () => {
								redo(tabId);
								return true;
							}
						},
						{
							key: 'Mod-s',
							run: () => {
								void flushTab(tabId, 'manual');
								return true;
							}
						},
						indentWithTab,
						...defaultKeymap
					]),
					EditorView.updateListener.of((u) => {
						if (u.docChanged && !applying) {
							setSource(tabId, view?.state.doc.toString() ?? '');
						}
					})
				]
			})
		});
		return () => {
			view?.destroy();
			view = null;
		};
	});

	// Sync the CodeMirror document when the source changes outside this editor
	// (store undo/redo, conflict reload, etc.).
	$effect(() => {
		const src = tab?.source;
		const v = view;
		if (!v || src === undefined) return;
		if (v.state.doc.toString() !== src && !applying) {
			applying = true;
			try {
				v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: src } });
			} finally {
				applying = false;
			}
		}
	});
</script>

<div class="box grow min-h-0" style="overflow:hidden;">
	<div bind:this={host} class="raw-host" />
</div>

<style>
	.raw-host {
		height: 100%;
	}
	.raw-host :global(.cm-editor) {
		height: 100%;
	}
	:global(.cm-editor .tok-heading) {
		color: var(--theme);
		font-weight: 600;
	}
	:global(.cm-editor .tok-strong) {
		font-weight: 700;
	}
	:global(.cm-editor .tok-emphasis) {
		font-style: italic;
	}
	:global(.cm-editor .tok-link),
	:global(.cm-editor .tok-url) {
		color: var(--accent);
		text-decoration: underline;
	}
	:global(.cm-editor .tok-quote),
	:global(.cm-editor .tok-comment),
	:global(.cm-editor .tok-meta) {
		color: var(--text-muted);
	}
	:global(.cm-editor .tok-monospace),
	:global(.cm-editor .tok-inline-code) {
		color: #16a34a;
	}
	:global(.cm-editor .tok-contentSeparator) {
		color: var(--text-muted);
	}
	:global(.cm-editor .tok-number),
	:global(.cm-editor .tok-bool) {
		color: #d97706;
	}
	:global(.cm-editor .tok-operator) {
		color: #dc2626;
	}
</style>
