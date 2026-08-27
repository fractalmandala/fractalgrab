<script lang="ts">
	import {
		Bold,
		Italic,
		Strikethrough,
		Code,
		Link2,
		ImagePlus,
		Heading1,
		Heading2,
		Heading3,
		List,
		ListOrdered,
		Quote
	} from '@lucide/svelte';

	export interface ToolbarCommands {
		bold(): void;
		italic(): void;
		strike(): void;
		inlineCode(): void;
		link(): void;
		image(): void;
		heading(level: number): void;
		list(ordered: boolean): void;
		quote(): void;
	}

	export interface ToolbarActive {
		bold: boolean;
		italic: boolean;
		strike: boolean;
		code: boolean;
		heading: number;
		list: boolean;
		quote: boolean;
	}

	let { commands, active }: { commands: ToolbarCommands; active: ToolbarActive } = $props();

	function tb(handler: () => void) {
		return (e: MouseEvent) => {
			e.preventDefault();
			handler();
		};
	}
</script>

<div class="toolbar" role="toolbar" aria-label="Formatting">
	<button
		class="tb-btn"
		data-active={active.bold}
		title="Bold (⌘B)"
		onmousedown={tb(commands.bold)}
	>
		<Bold size={13} />
	</button>
	<button
		class="tb-btn"
		data-active={active.italic}
		title="Italic (⌘I)"
		onmousedown={tb(commands.italic)}
	>
		<Italic size={13} />
	</button>
	<button
		class="tb-btn"
		data-active={active.strike}
		title="Strikethrough"
		onmousedown={tb(commands.strike)}
	>
		<Strikethrough size={13} />
	</button>
	<button
		class="tb-btn"
		data-active={active.code}
		title="Inline code"
		onmousedown={tb(commands.inlineCode)}
	>
		<Code size={13} />
	</button>
	<button class="tb-btn" title="Link" onmousedown={tb(commands.link)}>
		<Link2 size={13} />
	</button>
	<button class="tb-btn" title="Insert image" onmousedown={tb(commands.image)}>
		<ImagePlus size={13} />
	</button>

	<span class="tb-sep"></span>

	<button class="tb-btn" data-active={active.heading === 1} title="Heading 1" onmousedown={tb(() => commands.heading(1))}>
		<Heading1 size={13} />
	</button>
	<button class="tb-btn" data-active={active.heading === 2} title="Heading 2" onmousedown={tb(() => commands.heading(2))}>
		<Heading2 size={13} />
	</button>
	<button class="tb-btn" data-active={active.heading === 3} title="Heading 3" onmousedown={tb(() => commands.heading(3))}>
		<Heading3 size={13} />
	</button>

	<span class="tb-sep"></span>

	<button class="tb-btn" data-active={active.list} title="Bullet list" onmousedown={tb(() => commands.list(false))}>
		<List size={13} />
	</button>
	<button class="tb-btn" title="Numbered list" onmousedown={tb(() => commands.list(true))}>
		<ListOrdered size={13} />
	</button>
	<button class="tb-btn" data-active={active.quote} title="Blockquote" onmousedown={tb(commands.quote)}>
		<Quote size={13} />
	</button>
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 8px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-surface);
		flex-wrap: wrap;
		user-select: none;
	}
	.tb-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 24px;
		border-radius: var(--radius-6);
		color: var(--text-secondary);
		cursor: pointer;
	}
	.tb-btn:hover {
		background: var(--bg-raised);
		color: var(--text-primary);
	}
	.tb-btn[data-active='true'] {
		background: color-mix(in srgb, var(--theme) 18%, transparent);
		color: var(--theme);
	}
	.tb-sep {
		width: 1px;
		height: 16px;
		background: var(--border);
		margin: 0 6px;
	}
</style>
