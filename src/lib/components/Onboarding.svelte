<script lang="ts">
	import { FolderOpen, Sparkles, BookOpen, Keyboard } from '@lucide/svelte';
	import { manifest, persist, openSettings } from '../store.svelte';
	import { isTauri, backend } from '../backend';

	let { open = $bindable(false) }: { open: boolean } = $props();

	const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
	const mod = isMac ? '⌘' : 'Ctrl';

	let step = $state(0);

	async function pickFolder() {
		if (!isTauri()) return;
		const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
		const selected = await openDialog({ directory: true, multiple: false, title: 'Choose your library folder' });
		if (selected) {
			manifest.settings.libraryPath = selected as string;
			persist();
		}
	}

	function finish() {
		open = false;
		step = 0;
	}
</script>

{#if open}
	<div class="onboarding-overlay" role="dialog" aria-label="Welcome to FractalGrab" tabindex="-1" onclick={() => finish()} onkeydown={(e) => e.key === 'Escape' && finish()}>
		<div class="onboarding-panel" onclick={(e) => e.stopPropagation()}>
			{#if step === 0}
				<div class="onboarding-step">
					<div class="onboarding-icon">
						<Sparkles size={48} />
					</div>
					<h1>Welcome to FractalGrab</h1>
					<p class="onboarding-desc">
						A visual bookmark manager that stores everything as real files in a Finder-visible folder.
						No accounts, no lock-in — just your stuff, organized your way.
					</p>
					<div class="onboarding-features">
						<div class="feature">
							<BookOpen size={20} />
							<span>Save links, images, files & notes</span>
						</div>
						<div class="feature">
							<FolderOpen size={20} />
							<span>Everything lives in your library folder</span>
						</div>
						<div class="feature">
							<Keyboard size={20} />
							<span>Keyboard-first, built for speed</span>
						</div>
					</div>
					<button class="onboarding-btn primary" onclick={() => step = 1}>Get started</button>
				</div>
			{:else if step === 1}
				<div class="onboarding-step">
					<div class="onboarding-icon">
						<FolderOpen size={48} />
					</div>
					<h1>Choose your library</h1>
					<p class="onboarding-desc">
						FractalGrab saves everything to a folder on your Mac. This is where your bookmarks, images, and notes live — visible in Finder at any time.
					</p>
					<div class="current-path">
						<code>{manifest.settings.libraryPath}</code>
					</div>
					{#if isTauri()}
						<button class="onboarding-btn secondary" onclick={pickFolder}>
							<FolderOpen size={16} /> Choose a different folder
						</button>
					{/if}
					<button class="onboarding-btn primary" onclick={() => step = 2}>Continue</button>
				</div>
			{:else if step === 2}
				<div class="onboarding-step">
					<div class="onboarding-icon">
						<Keyboard size={48} />
					</div>
					<h1>Quick shortcuts</h1>
					<p class="onboarding-desc">
						A few handy shortcuts to get you started.
					</p>
					<div class="shortcuts-grid">
						<div class="shortcut-item">
							<kbd>/</kbd>
							<span>Search</span>
						</div>
						<div class="shortcut-item">
							<kbd>C</kbd>
							<span>Capture URL</span>
						</div>
						<div class="shortcut-item">
							<kbd>Esc</kbd>
							<span>Close / deselect</span>
						</div>
						<div class="shortcut-item">
							<kbd>{mod}+/</kbd>
							<span>All shortcuts</span>
						</div>
					</div>
					<p class="onboarding-desc" style="margin-top:16px; font-size:12px;">
						You can always press <kbd>{mod}+</kbd><kbd>/</kbd> to see all shortcuts.
					</p>
					<button class="onboarding-btn primary" onclick={finish}>Start using FractalGrab</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.onboarding-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		animation: fadeIn 0.3s ease;
	}
	.onboarding-panel {
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: 18px;
		box-shadow: var(--shadow-lg);
		width: 460px;
		max-height: 80vh;
		overflow: hidden;
		animation: slideUp 0.35s ease;
	}
	.onboarding-step {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 40px 36px 32px;
		text-align: center;
	}
	.onboarding-icon {
		width: 80px;
		height: 80px;
		border-radius: 20px;
		background: color-mix(in srgb, var(--theme) 12%, transparent);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 20px;
		color: var(--theme);
	}
	h1 {
		margin: 0 0 12px;
		font-size: 20px;
		font-weight: 700;
	}
	.onboarding-desc {
		margin: 0 0 20px;
		font-size: 14px;
		color: var(--text-muted);
		line-height: 1.5;
		max-width: 360px;
	}
	.onboarding-features {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 100%;
		margin-bottom: 28px;
	}
	.feature {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		background: var(--bg-sunken);
		border-radius: 10px;
		font-size: 13px;
		text-align: left;
	}
	.current-path {
		padding: 10px 16px;
		background: var(--bg-sunken);
		border-radius: 10px;
		margin-bottom: 16px;
		width: 100%;
		overflow: hidden;
	}
	.current-path code {
		font-size: 13px;
		word-break: break-all;
	}
	.shortcuts-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		width: 100%;
		margin-bottom: 8px;
	}
	.shortcut-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		background: var(--bg-sunken);
		border-radius: 10px;
		font-size: 13px;
	}
	.shortcut-item kbd {
		font-family: monospace;
		font-size: 12px;
		padding: 2px 8px;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: 6px;
	}
	.onboarding-btn {
		padding: 10px 28px;
		border-radius: 10px;
		border: none;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		transition: opacity 0.15s;
	}
	.onboarding-btn:hover {
		opacity: 0.85;
	}
	.onboarding-btn.primary {
		background: var(--theme);
		color: var(--bg-surface);
	}
	.onboarding-btn.secondary {
		background: var(--bg-sunken);
		color: var(--text);
		border: 1px solid var(--border);
		margin-bottom: 12px;
	}
	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}
	@keyframes slideUp {
		from { opacity: 0; transform: translateY(16px); }
		to { opacity: 1; transform: translateY(0); }
	}
</style>
