<script lang="ts">
	import { onMount } from 'svelte';
	import MarkdownIt from 'markdown-it';
	import { backend } from '$lib/backend';
	import { askInput, toast } from '$lib/store.svelte';
	import { notesUi, setSource, flushTab, undo, redo } from '$lib/notes/notes.svelte';
	import { parseDocument, serializeDocument, type Block, type MdDocument } from '$lib/notes/mdBlocks';
	import { domToMarkdown } from '$lib/notes/domToMarkdown';
	import EditorToolbar, { type ToolbarActive, type ToolbarCommands } from './EditorToolbar.svelte';

	let { tabId }: { tabId: string } = $props();

	const tab = $derived(notesUi.tabs.find((t) => t.id === tabId) ?? null);

	const md = new MarkdownIt({ html: false, linkify: false, breaks: false });

	// eslint-disable-next-line svelte/valid-compile — tab is reactive via $derived, initial value is correct because
	// the component is keyed on tab.id and re-created on tab switch ({#key tab.id + tab.view})
	let doc: MdDocument = $state(parseDocument(tab?.source ?? ''));
	let lastPushed = $state(tab?.source ?? '');
	let container: HTMLDivElement;
	let toolbarState: ToolbarActive = $state({
		bold: false,
		italic: false,
		strike: false,
		code: false,
		heading: 0,
		list: false,
		quote: false
	});

	function errMsg(e: unknown): string {
		return e instanceof Error ? e.message : String(e);
	}

	// ---------------------------------------------------------------------
	// Rendering
	// ---------------------------------------------------------------------

	function resolveImages(el: HTMLElement) {
		const dir = (tab?.path ?? '').slice(0, (tab?.path ?? '').lastIndexOf('/'));
		for (const img of el.querySelectorAll('img')) {
			const src = img.getAttribute('src') ?? '';
			if (/^(https?:|data:|#|\/)/.test(src)) continue;
			const abs = dir ? dir + '/' + src : src;
			img.dataset.mdSrc = src;
			img.src = backend.pathFileUrl(abs);
		}
	}

	function renderBlock(b: Block, idx: number): HTMLElement {
		const readonly = b.readOnly || b.kind === 'thematic';
		if (readonly) {
			const el = document.createElement('div');
			el.dataset.mdIndex = String(idx);
			el.dataset.mdReadonly = 'true';
			el.contentEditable = 'false';
			el.className = 'md-block md-readonly';
			if (b.kind === 'html') {
				const pre = document.createElement('pre');
				pre.textContent = b.source;
				el.appendChild(pre);
			} else if (b.kind === 'thematic') {
				const hr = document.createElement('hr');
				el.appendChild(hr);
			} else {
				el.innerHTML = md.render(b.source);
			}
			return el;
		}
		if (b.kind === 'blank') {
			const el = document.createElement('div');
			el.dataset.mdIndex = String(idx);
			el.className = 'md-block md-blank';
			el.contentEditable = 'true';
			return el;
		}
		const tmp = document.createElement('div');
		tmp.innerHTML = md.render(b.source).trim();
		const el = (tmp.firstElementChild as HTMLElement) ?? document.createElement('p');
		el.dataset.mdIndex = String(idx);
		el.contentEditable = 'true';
		el.className = 'md-block';
		resolveImages(el);
		return el;
	}

	function renderBlocks() {
		if (!container) return;
		container.innerHTML = '';
		// YAML frontmatter is metadata: hidden from the rendered view. When the
		// document has frontmatter, the first `#` heading is the redundant title
		// and is hidden too (PRODUCT: frontmatter title drives the tab name).
		const hasFrontmatter = doc.blocks[0]?.kind === 'frontmatter';
		let h1Hidden = false;
		doc.blocks.forEach((b, i) => {
			if (b.kind === 'frontmatter') return;
			if (hasFrontmatter && !h1Hidden && b.kind === 'heading' && /^ {0,3}#(?!##)\s/.test(b.source)) {
				h1Hidden = true;
				return;
			}
			container.appendChild(renderBlock(b, i));
		});
	}

	// ---------------------------------------------------------------------
	// Caret helpers
	// ---------------------------------------------------------------------

	function currentBlock(): HTMLElement | null {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return null;
		const node = sel.anchorNode;
		if (!node) return null;
		return (node instanceof Element ? node : node.parentElement)?.closest('[data-md-index]') as HTMLElement | null;
	}

	function caretAtBlockStart(blockEl: HTMLElement): boolean {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return false;
		const r = sel.getRangeAt(0);
		if (!r.collapsed || !blockEl.contains(r.startContainer)) return false;
		const check = document.createRange();
		check.selectNodeContents(blockEl);
		check.setEnd(r.startContainer, r.startOffset);
		return check.toString().length === 0;
	}

	function caretAtBlockEnd(blockEl: HTMLElement): boolean {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return false;
		const r = sel.getRangeAt(0);
		if (!r.collapsed || !blockEl.contains(r.startContainer)) return false;
		const check = document.createRange();
		check.selectNodeContents(blockEl);
		check.setStart(r.startContainer, r.startOffset);
		return check.toString().length === 0;
	}

	function placeCaret(blockEl: HTMLElement, atEnd: boolean) {
		const sel = window.getSelection();
		const r = document.createRange();
		r.selectNodeContents(blockEl);
		r.collapse(!atEnd);
		sel?.removeAllRanges();
		sel?.addRange(r);
	}

	function textNodeAtOffset(el: HTMLElement, offset: number): { node: Node; offset: number } {
		let remaining = offset;
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		let n: Node | null;
		while ((n = walker.nextNode())) {
			const len = n.textContent?.length ?? 0;
			if (remaining <= len) return { node: n, offset: remaining };
			remaining -= len;
		}
		return { node: el, offset: el.childNodes.length };
	}

	function restoreCaret(pos: { index: number; offset: number } | null) {
		if (!pos || !container) return;
		const blockEl = container.querySelector(`[data-md-index="${pos.index}"]`) as HTMLElement | null;
		if (!blockEl) return;
		if (pos.offset === 0) {
			placeCaret(blockEl, false);
			return;
		}
		const { node, offset } = textNodeAtOffset(blockEl, pos.offset);
		const r = document.createRange();
		r.setStart(node, Math.min(offset, (node.textContent ?? '').length));
		r.collapse(true);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(r);
	}

	function captureCaret(): { index: number; offset: number } | null {
		const blockEl = currentBlock();
		if (!blockEl) return null;
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return null;
		const r = sel.getRangeAt(0);
		const before = document.createRange();
		before.selectNodeContents(blockEl);
		before.setEnd(r.startContainer, r.startOffset);
		return { index: Number(blockEl.dataset.mdIndex), offset: before.toString().length };
	}

	// ---------------------------------------------------------------------
	// Source sync
	// ---------------------------------------------------------------------

	function push() {
		const s = serializeDocument(doc);
		lastPushed = s;
		setSource(tabId, s);
	}

	function notifyBlockChanged() {
		const blockEl = currentBlock();
		if (!blockEl) return;
		const idx = Number(blockEl.dataset.mdIndex);
		const b = doc.blocks[idx];
		if (b && !b.readOnly) {
			b.source = domToMarkdown(blockEl);
			push();
		}
	}

	// External source changes (store undo/redo, conflict reload) re-parse.
	// The caret is captured first and restored after re-render so undo/redo
	// keeps the caret in the same logical spot (PRODUCT 25).
	$effect(() => {
		const src = tab?.source;
		if (src === undefined || src === null) return;
		if (src !== lastPushed) {
			const caret = captureCaret();
			doc = parseDocument(src);
			lastPushed = src;
			renderBlocks();
			restoreCaret(caret);
		}
	});

	// ---------------------------------------------------------------------
	// Block operations
	// ---------------------------------------------------------------------

	function splitElement(el: HTMLElement): { before: HTMLElement; after: HTMLElement } {
		const sel = window.getSelection();
		const before = document.createElement(el.tagName);
		const after = document.createElement(el.tagName);
		if (!sel || sel.rangeCount === 0) {
			before.append(...el.childNodes);
			return { before, after };
		}
		const range = sel.getRangeAt(0);
		const beforeRange = range.cloneRange();
		beforeRange.selectNodeContents(el);
		beforeRange.setEnd(range.startContainer, range.startOffset);
		before.appendChild(beforeRange.cloneContents());
		const afterRange = range.cloneRange();
		afterRange.selectNodeContents(el);
		afterRange.setStart(range.endContainer, range.endOffset);
		after.appendChild(afterRange.cloneContents());
		return { before, after };
	}

	function splitBlock(blockEl: HTMLElement) {
		const idx = Number(blockEl.dataset.mdIndex);
		const { before, after } = splitElement(blockEl);
		const beforeSrc = domToMarkdown(before);
		const afterSrc = domToMarkdown(after);
		doc.blocks[idx] = { ...doc.blocks[idx], source: beforeSrc };
		doc.blocks.splice(idx + 1, 0, { kind: 'paragraph', source: afterSrc, readOnly: false });
		renderBlocks();
		restoreCaret({ index: idx + 1, offset: 0 });
		push();
	}

	function insertBlockAfter(idx: number, block: Block) {
		doc.blocks.splice(idx + 1, 0, block);
		renderBlocks();
		restoreCaret({ index: idx + 1, offset: 0 });
		push();
	}

	function handleEnterInLi(li: HTMLElement) {
		const list = li.parentElement!;
		const listEl = list.closest('[data-md-index]') as HTMLElement;
		const listIdx = Number(listEl.dataset.mdIndex);
		const { before, after } = splitElement(li);
		const beforeSrc = domToMarkdown(before);
		const afterSrc = domToMarkdown(after);
		if (beforeSrc.trim() === '') {
			// Empty item → exit the list into a new paragraph.
			li.remove();
			doc.blocks.splice(listIdx, 1);
			insertBlockAfter(listIdx - 1, { kind: 'paragraph', source: afterSrc, readOnly: false });
			return;
		}
		// Keep the before-text in the current item, start a new item with the
		// after-text.
		li.innerHTML = '';
		li.append(...before.childNodes);
		const li2 = document.createElement('li');
		li2.append(...after.childNodes);
		list.appendChild(li2);
		doc.blocks[listIdx] = { kind: 'list', source: domToMarkdown(listEl), readOnly: false };
		push();
		placeCaret(li2, false);
	}

	function mergeWithPrev(blockEl: HTMLElement) {
		const idx = Number(blockEl.dataset.mdIndex);
		if (idx <= 0) return;
		const prev = doc.blocks[idx - 1];
		const cur = doc.blocks[idx];
		if (!prev || prev.readOnly || prev.kind === 'blank') return;
		if (cur.kind !== 'paragraph' && cur.kind !== 'heading' && cur.kind !== 'quote') return;
		if (prev.kind !== 'paragraph' && prev.kind !== 'heading' && prev.kind !== 'quote') return;
		const prevEl = container.querySelector(`[data-md-index="${idx - 1}"]`) as HTMLElement | null;
		if (!prevEl) return;
		while (blockEl.firstChild) prevEl.appendChild(blockEl.firstChild);
		doc.blocks[idx - 1] = { ...prev, source: domToMarkdown(prevEl) };
		doc.blocks.splice(idx, 1);
		renderBlocks();
		placeCaret(container.querySelector(`[data-md-index="${idx - 1}"]`) as HTMLElement, true);
		push();
	}

	function neighborReadOnly(backward: boolean): boolean {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return false;
		const range = sel.getRangeAt(0);
		if (!range.collapsed) return false;
		const blockEl = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest('[data-md-index]') as HTMLElement | null;
		if (!blockEl) return false;
		const atEdge = backward ? caretAtBlockStart(blockEl) : caretAtBlockEnd(blockEl);
		if (!atEdge) return false;
		const siblings = [...container.children];
		const i = siblings.indexOf(blockEl);
		const neighbor = backward ? siblings[i - 1] : siblings[i + 1];
		return !!neighbor && (neighbor as HTMLElement).dataset.mdReadonly === 'true';
	}

	// ---------------------------------------------------------------------
	// Inline formatting
	// ---------------------------------------------------------------------

	function insertNodeAtCaret(node: Node) {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const range = sel.getRangeAt(0);
		range.deleteContents();
		range.insertNode(node);
		range.setStartAfter(node);
		range.collapse(true);
		sel.removeAllRanges();
		sel.addRange(range);
	}

	function wrapInline(tag: string, attrs?: Record<string, string>) {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const range = sel.getRangeAt(0);
		const startBlock = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest('[data-md-index]');
		const endBlock = (range.endContainer instanceof Element ? range.endContainer : range.endContainer.parentElement)?.closest('[data-md-index]');
		if (startBlock && endBlock && startBlock !== endBlock) return;
		if (range.collapsed) {
			const el = document.createElement(tag);
			if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
			el.appendChild(document.createTextNode('\u200b'));
			range.insertNode(el);
			const r = document.createRange();
			r.setStart(el.firstChild!, 0);
			r.collapse(true);
			sel.removeAllRanges();
			sel.addRange(r);
		} else {
			const el = document.createElement(tag);
			if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
			const frag = range.extractContents();
			el.appendChild(frag);
			range.insertNode(el);
			range.selectNodeContents(el);
			sel.removeAllRanges();
			sel.addRange(range);
		}
		notifyBlockChanged();
		refreshToolbarState();
	}

	function replaceBlock(newEl: HTMLElement, idx: number, block: Block) {
		const old = container.querySelector(`[data-md-index="${idx}"]`) as HTMLElement | null;
		if (old) old.replaceWith(newEl);
		doc.blocks[idx] = block;
		placeCaret(newEl, false);
		push();
		refreshToolbarState();
	}

	function setHeading(level: number) {
		const blockEl = currentBlock();
		if (!blockEl) return;
		const idx = Number(blockEl.dataset.mdIndex);
		const b = doc.blocks[idx];
		if (!b || b.readOnly) return;
		const h = document.createElement(`h${level}`);
		h.className = 'md-block';
		h.contentEditable = 'true';
		h.dataset.mdIndex = String(idx);
		h.innerHTML = blockEl.innerHTML;
		replaceBlock(h, idx, { kind: 'heading', source: domToMarkdown(h), readOnly: false });
	}

	function makeList(ordered: boolean) {
		const blockEl = currentBlock();
		if (!blockEl) return;
		const idx = Number(blockEl.dataset.mdIndex);
		const b = doc.blocks[idx];
		if (!b || b.readOnly) return;
		const list = document.createElement(ordered ? 'ol' : 'ul');
		list.className = 'md-block';
		list.contentEditable = 'true';
		list.dataset.mdIndex = String(idx);
		const li = document.createElement('li');
		li.innerHTML = blockEl.innerHTML;
		list.appendChild(li);
		replaceBlock(list, idx, { kind: 'list', source: domToMarkdown(list), readOnly: false });
	}

	function toggleQuote() {
		const blockEl = currentBlock();
		if (!blockEl) return;
		const idx = Number(blockEl.dataset.mdIndex);
		const b = doc.blocks[idx];
		if (!b || b.readOnly) return;
		if (blockEl.tagName === 'BLOCKQUOTE') {
			const p = document.createElement('p');
			p.className = 'md-block';
			p.contentEditable = 'true';
			p.dataset.mdIndex = String(idx);
			p.innerHTML = blockEl.innerHTML;
			replaceBlock(p, idx, { kind: 'paragraph', source: domToMarkdown(p), readOnly: false });
		} else {
			const q = document.createElement('blockquote');
			q.className = 'md-block';
			q.contentEditable = 'true';
			q.dataset.mdIndex = String(idx);
			q.innerHTML = blockEl.innerHTML;
			replaceBlock(q, idx, { kind: 'quote', source: domToMarkdown(q), readOnly: false });
		}
	}

	function addLink() {
		askInput('Add link', 'https://…', '', (url) => {
			const u = url.trim();
			if (u) wrapInline('a', { href: u });
		});
	}

	function insertImage() {
		const t = tab;
		if (!t) return;
		if (!t.path || t.missing) {
			toast('Save the note first — the image needs a folder', 'error');
			return;
		}
		void (async () => {
			const files = await backend.chooseFiles();
			const imgPath = files[0];
			if (!imgPath) return;
			if (!/\.(jpe?g|png|gif|webp|avif|svg|bmp|heic)$/i.test(imgPath)) {
				toast('Pick an image file', 'error');
				return;
			}
			const dir = t.path.slice(0, t.path.lastIndexOf('/'));
			try {
				const dest = await backend.notesCopy(imgPath, dir);
				const rel = dest.split('/').filter(Boolean).pop()!;
				const imgEl = document.createElement('img');
				imgEl.src = backend.pathFileUrl(dest);
				imgEl.alt = rel.replace(/\.[^.]+$/, '');
				imgEl.dataset.mdSrc = rel;
				insertNodeAtCaret(imgEl);
				notifyBlockChanged();
			} catch (e) {
				toast(errMsg(e), 'error');
			}
		})();
	}

	// ---------------------------------------------------------------------
	// Toolbar active-state reflection
	// ---------------------------------------------------------------------

	function refreshToolbarState() {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return;
		const node = sel.anchorNode;
		if (!node) return;
		let bold = false,
			italic = false,
			strike = false,
			code = false;
		let n: Node | null = node;
		while (n && n !== container) {
			if (n instanceof HTMLElement) {
				const tag = n.tagName.toLowerCase();
				if (tag === 'strong' || tag === 'b') bold = true;
				if (tag === 'em' || tag === 'i') italic = true;
				if (tag === 'del' || tag === 's') strike = true;
				if (tag === 'code') code = true;
			}
			n = n.parentNode;
		}
		const blockEl = currentBlock();
		let heading = 0,
			list = false,
			quote = false;
		if (blockEl) {
			const tag = blockEl.tagName.toLowerCase();
			if (tag === 'blockquote') quote = true;
			if (tag === 'ul' || tag === 'ol') list = true;
			const m = tag.match(/^h([1-6])$/);
			if (m) heading = Number(m[1]);
		}
		toolbarState = { bold, italic, strike, code, heading, list, quote };
	}

	const commands: ToolbarCommands = {
		bold: () => wrapInline('strong'),
		italic: () => wrapInline('em'),
		strike: () => wrapInline('del'),
		inlineCode: () => wrapInline('code'),
		link: addLink,
		image: insertImage,
		heading: setHeading,
		list: makeList,
		quote: toggleQuote
	};

	// ---------------------------------------------------------------------
	// Events
	// ---------------------------------------------------------------------

	function onInput(e: Event) {
		const t = e.target as HTMLElement;
		// Browsers fire `input` on the contenteditable editing host (and
		// sometimes on the mutated element itself) — resolve the owning block
		// from the target, falling back to the caret inside the editor.
		let blockEl = t.closest('[data-md-index]') as HTMLElement | null;
		if (!blockEl && t.closest('.rich-host')) blockEl = currentBlock();
		if (!blockEl) return;
		const idx = Number(blockEl.dataset.mdIndex);
		const b = doc.blocks[idx];
		if (!b || b.readOnly) return;
		b.source = domToMarkdown(blockEl);
		push();
		refreshToolbarState();
	}

	function onKeydown(e: KeyboardEvent) {
		const blockEl = ((e.target as Element).closest?.('[data-md-index]')) as HTMLElement | null;
		if (!blockEl) return;
		const mod = e.metaKey || e.ctrlKey;
		if (mod && e.key.toLowerCase() === 's') {
			e.preventDefault();
			void flushTab(tabId, 'manual');
			return;
		}
		if (mod && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			if (e.shiftKey) redo(tabId);
			else undo(tabId);
			return;
		}
		if (mod && e.key.toLowerCase() === 'y') {
			e.preventDefault();
			redo(tabId);
			return;
		}
		if (mod && e.key.toLowerCase() === 'b') {
			e.preventDefault();
			wrapInline('strong');
			return;
		}
		if (mod && e.key.toLowerCase() === 'i') {
			e.preventDefault();
			wrapInline('em');
			return;
		}
		if (e.key === 'Escape') {
			container.blur();
			return;
		}
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (blockEl.tagName === 'LI') handleEnterInLi(blockEl);
			else splitBlock(blockEl);
			return;
		}
		if (e.key === 'Backspace' && caretAtBlockStart(blockEl)) {
			e.preventDefault();
			mergeWithPrev(blockEl);
			return;
		}
		if ((e.key === 'Backspace' && neighborReadOnly(true)) || (e.key === 'Delete' && neighborReadOnly(false))) {
			e.preventDefault();
		}
	}

	function onPaste(e: ClipboardEvent) {
		e.preventDefault();
		const text = e.clipboardData?.getData('text/plain') ?? '';
		document.execCommand('insertText', false, text);
	}

	function onClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.tagName === 'A') {
			e.preventDefault();
			const href = target.getAttribute('href') ?? '';
			if (/^https?:/i.test(href)) backend.openItem(undefined, href);
		} else if (target.tagName === 'IMG') {
			e.preventDefault();
			const src = target.dataset.mdSrc ?? target.getAttribute('src') ?? '';
			if (src && !/^https?:/i.test(src)) {
				const dir = (tab?.path ?? '').slice(0, (tab?.path ?? '').lastIndexOf('/'));
				void backend.openPathExternal(dir ? dir + '/' + src : src);
			}
		}
	}

	onMount(() => {
		renderBlocks();
		document.addEventListener('selectionchange', refreshToolbarState);
		return () => document.removeEventListener('selectionchange', refreshToolbarState);
	});
</script>

<div class="box col grow min-h-0">
	<EditorToolbar {commands} active={toolbarState} />
	<div
		class="rich-host box grow min-h-0"
		contenteditable="true"
		role="textbox"
		tabindex="0"
		aria-multiline="true"
		aria-label="Rich text editor"
		bind:this={container}
		oninput={onInput}
		onkeydown={onKeydown}
		onpaste={onPaste}
		onclick={onClick}
		oncontextmenu={(e) => e.preventDefault()}
		spellcheck="true"
	>
	</div>
</div>

<style>
	.rich-host {
		overflow-y: auto;
		padding: 14px 20px 60px;
		outline: none;
		caret-color: var(--text-primary);
	}
	.rich-host :global(.md-block) {
		margin: 0 0 10px;
		line-height: 1.6;
		font-size: 14px;
		color: var(--text-primary);
	}
	.rich-host :global(.md-block.md-blank) {
		min-height: 1.2em;
	}
	.rich-host :global(.md-block.md-readonly) {
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-8);
		background: var(--bg-raised);
		color: var(--text-secondary);
		font-size: 13px;
	}
	.rich-host :global(.md-block.md-readonly pre) {
		margin: 0;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.rich-host :global(.md-block.md-readonly table) {
		border-collapse: collapse;
		width: 100%;
	}
	.rich-host :global(.md-block.md-readonly th),
	.rich-host :global(.md-block.md-readonly td) {
		border: 1px solid var(--border);
		padding: 4px 8px;
		text-align: left;
	}
	.rich-host :global(.md-block h1),
	.rich-host :global(.md-block h2),
	.rich-host :global(.md-block h3),
	.rich-host :global(.md-block h4),
	.rich-host :global(.md-block h5),
	.rich-host :global(.md-block h6) {
		margin: 14px 0 8px;
		line-height: 1.3;
		color: var(--text-primary);
	}
	.rich-host :global(.md-block h1) {
		font-size: 24px;
	}
	.rich-host :global(.md-block h2) {
		font-size: 20px;
	}
	.rich-host :global(.md-block h3) {
		font-size: 17px;
	}
	.rich-host :global(.md-block h4) {
		font-size: 15px;
	}
	.rich-host :global(.md-block ul),
	.rich-host :global(.md-block ol) {
		padding-left: 22px;
		margin: 6px 0;
	}
	.rich-host :global(.md-block blockquote) {
		border-left: 3px solid var(--border-strong, var(--border));
		padding-left: 12px;
		margin: 8px 0;
		color: var(--text-secondary);
	}
	.rich-host :global(.md-block code) {
		background: var(--bg-raised);
		padding: 1px 4px;
		border-radius: var(--radius-4);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.9em;
	}
	.rich-host :global(.md-block a) {
		color: var(--accent);
		text-decoration: underline;
	}
	.rich-host :global(.md-block img) {
		max-width: 100%;
		border-radius: var(--radius-8);
	}
	.rich-host :global(.md-block hr) {
		border: none;
		border-top: 1px solid var(--border);
		margin: 14px 0;
	}
	.rich-host :global(.md-block:focus-visible) {
		outline: none;
	}
</style>
