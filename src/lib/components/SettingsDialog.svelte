<script lang="ts">
	import { Plus, Trash2, X } from '@lucide/svelte';
	import { backend, isTauri } from '../backend';
	import { newProvider } from '../ai';
	import {
		manifest,
		persistNow,
		rescan,
		toast,
		updateItem,
		closeSettings,
		setLibraryDirState,
		setBackupMeta,
		ui
	} from '../store.svelte';
	import { downloadBlob } from '../pdf';
	import type { AIProvider } from '../types';

	let autoTag = $state(false);
	let autoRename = $state(false);
	let backupEnabled = $state(true);
	let backupHours = $state(6);
	let extServer = $state(false);
	let testingAi = $state(false);
	let busy = $state(false);

	let providers = $state<AIProvider[]>([]);
	let activeProviderId = $state('');
	let activeModel = $state('');

	$effect(() => {
		if (ui.settingsOpen) {
			providers = JSON.parse(JSON.stringify(manifest.settings.ai.providers)) as AIProvider[];
			activeProviderId = manifest.settings.ai.activeProviderId;
			activeModel = manifest.settings.ai.activeModel;
			autoTag = manifest.settings.ai.autoTag;
			autoRename = manifest.settings.ai.autoRename;
			backupEnabled = manifest.settings.backup.enabled;
			backupHours = manifest.settings.backup.intervalHours;
			extServer = manifest.settings.extensionServer;
		}
	});

	const active = $derived(providers.find((p) => p.id === activeProviderId) ?? providers[0] ?? null);

	function saveSettings() {
		manifest.settings.ai = {
			providers: providers.map((p) => ({
				...p,
				baseUrl: p.baseUrl.trim(),
				key: p.key.trim(),
				name: p.name.trim() || 'Provider'
			})),
			activeProviderId: active?.id ?? '',
			activeModel: activeModel || active?.models[0] || '',
			autoTag,
			autoRename
		};
		manifest.settings.backup = { enabled: backupEnabled, intervalHours: Math.max(1, backupHours) };
		manifest.settings.extensionServer = extServer;
		persistNow();
		if (isTauri()) backend.setExtensionServer(extServer).catch(() => {});
		toast('Settings saved', 'success');
	}

	function addProvider() {
		providers = [...providers, newProvider('Provider')];
	}

	function removeProvider(id: string) {
		if (providers.length <= 1) {
			toast('Keep at least one provider', 'info');
			return;
		}
		providers = providers.filter((p) => p.id !== id);
		if (activeProviderId === id) activeProviderId = providers[0].id;
	}

	function updateProvider(id: string, patch: Partial<AIProvider>) {
		providers = providers.map((p) => (p.id === id ? { ...p, ...patch } : p));
	}

	function parseModels(raw: string): string[] {
		return raw
			.split(',')
			.map((m) => m.trim())
			.filter(Boolean);
	}

	async function chooseLibrary() {
		if (!isTauri()) {
			toast('Only the desktop app has a real file library', 'info');
			return;
		}
		const dir = await backend.chooseFolder();
		if (!dir) return;
		if (!confirm(`Move your library to ${dir}? Files will be copied across.`)) return;
		busy = true;
		try {
			const oldDir = await backend.getLibraryDir();
			const newDir = await backend.setLibraryDir(dir);
			for (const item of manifest.items) {
				try {
					const newName = await backend.importFile(`${oldDir}/${item.filename}`);
					if (newName) updateItem(item.id, { filename: newName });
				} catch {
					/* file missing — skip */
				}
			}
			setLibraryDirState(newDir);
			await persistNow();
			await rescan();
			toast('Library moved', 'success');
		} catch (e) {
			toast(`Could not move library: ${e}`, 'error');
		} finally {
			busy = false;
		}
	}

	async function testAi() {
		if (!active) return;
		testingAi = true;
		try {
			const resp = await fetch(`${active.baseUrl.trim().replace(/\/+$/, '')}/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${active.key.trim()}` },
				body: JSON.stringify({
					model: activeModel || active.models[0],
					messages: [{ role: 'user', content: 'ping' }],
					max_tokens: 5
				})
			});
			if (resp.ok) toast(`AI connection works (${active.name} · ${activeModel || active.models[0]})`, 'success');
			else toast(`AI request failed (${resp.status})`, 'error');
		} catch (e) {
			toast(`AI unreachable: ${e instanceof Error ? e.message : e}`, 'error');
		} finally {
			testingAi = false;
		}
	}

	async function backupNow() {
		busy = true;
		try {
			const path = await backend.backupNow();
			setBackupMeta(await backend.getBackupMeta());
			toast(`Backup created: ${path}`, 'success');
		} catch (e) {
			toast(`Backup failed: ${e}`, 'error');
		} finally {
			busy = false;
		}
	}

	async function exportJson() {
		downloadBlob(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }), `fractalgrab-library-${Date.now()}.json`);
	}
</script>

{#if ui.settingsOpen}
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) closeSettings(); }}>
		<div class="panel">
			<div class="panel-header">
				<h2 class="text-lg" style="margin:0;">Settings</h2>
				<button class="button" data-variant="icon" onclick={closeSettings}><X size={18} /></button>
			</div>

			<div class="panel-body">
				<div class="field">
					<label>Library folder — real files, no lock-in</label>
					<div class="row ycenter gap8">
						<span class="grow text-xs text-muted truncate">{ui.libraryDir}</span>
						<button class="button" data-variant="quiet" data-size="sm" onclick={chooseLibrary} disabled={busy}>Change…</button>
					</div>
				</div>

				<div class="field">
					<label>Browser extension server (localhost :48123)</label>
					<div class="row ycenter gap8">
						<button class="switch" data-state={extServer ? 'on' : 'off'} onclick={() => (extServer = !extServer)} role="switch" aria-checked={extServer}></button>
						<span class="text-xs text-muted">Lets the Chrome companion clipper talk to this app on your machine only.</span>
					</div>
				</div>

				<hr class="divider" style="margin:4px 0;" />

				<div class="field">
					<label>AI providers — bring your own, any number, any OpenAI-compatible endpoint</label>

					{#each providers as p, i (p.id)}
						<div class="card box gap8" style="padding:12px; {p.id === activeProviderId ? 'border-color: var(--theme);' : ''}">
							<div class="row ycenter gap8">
								<label class="row ycenter" style="gap:6px; cursor:pointer; flex:1;">
									<input type="radio" name="fg-provider" checked={p.id === activeProviderId} onchange={() => (activeProviderId = p.id)} />
									<input placeholder="Name (e.g. OpenAI, Local, Groq)" value={p.name} style="flex:1;" oninput={(e) => updateProvider(p.id, { name: e.currentTarget.value })} />
								</label>
								{#if providers.length > 1}
									<button class="button" data-variant="icon" title="Remove provider" onclick={() => removeProvider(p.id)}><Trash2 size={14} /></button>
								{/if}
							</div>
							<input placeholder="Base URL, e.g. https://api.openai.com/v1" value={p.baseUrl} oninput={(e) => updateProvider(p.id, { baseUrl: e.currentTarget.value })} />
							<input type="password" placeholder="API key" value={p.key} oninput={(e) => updateProvider(p.id, { key: e.currentTarget.value })} />
							<input
								placeholder="Models, comma-separated (e.g. gpt-4o-mini, gpt-4o)"
								value={p.models.join(', ')}
								oninput={(e) => updateProvider(p.id, { models: parseModels(e.currentTarget.value) })}
							/>
						</div>
					{/each}

					<div class="row ycenter gap8">
						<button class="button" data-variant="quiet" data-size="sm" onclick={addProvider}><Plus size={12} /> Add provider</button>
					</div>

					<div class="row ycenter gap8">
						<label class="text-xs" style="white-space:nowrap;">Active model</label>
						<select
							value={activeModel}
							onchange={(e) => (activeModel = e.currentTarget.value)}
							style="flex:1;"
						>
							{#each providers as p (p.id)}
								{#each p.models as m (p.id + m)}
									<option value={m} selected={m === activeModel && p.id === activeProviderId}>
										{p.name} · {m}
									</option>
								{/each}
							{/each}
						</select>
					<button class="button" data-variant="quiet" data-size="sm" onclick={testAi} disabled={testingAi || !active?.key.trim()}>
						{testingAi ? 'Testing…' : 'Test'}
					</button>
					</div>

					<div class="row ycenter gap8">
						<label class="row ycenter" style="gap:6px; cursor:pointer;">
							<input type="checkbox" bind:checked={autoTag} /> Auto-tag on save
						</label>
						<label class="row ycenter" style="gap:6px; cursor:pointer;">
							<input type="checkbox" bind:checked={autoRename} /> AI-rename files
						</label>
					</div>
					<p class="text-xs text-muted">Everything stays on your Mac unless you turn AI on — and even then only your chosen providers see items you send them.</p>
				</div>

				<hr class="divider" style="margin:4px 0;" />

				<div class="field">
					<label>Backups</label>
					<div class="row ycenter gap8">
						<button class="switch" data-state={backupEnabled ? 'on' : 'off'} onclick={() => (backupEnabled = !backupEnabled)} role="switch" aria-checked={backupEnabled}></button>
						<span class="text-xs">Every</span>
						<input type="number" min="1" bind:value={backupHours} style="width:64px;" /> <span class="text-xs">hours</span>
					</div>
					<div class="row ycenter gap8">
						<button class="button" data-variant="quiet" data-size="sm" onclick={backupNow} disabled={busy}>Back up now</button>
						{#if ui.backupMeta?.lastBackupAt}
							<span class="text-xs text-muted">Last: {new Date(ui.backupMeta.lastBackupAt).toLocaleString()}</span>
						{/if}
					</div>
				</div>

				<div class="row ycenter gap8" style="margin-top:4px;">
					<button class="button" data-variant="quiet" data-size="sm" onclick={exportJson}>Export library JSON</button>
					<button class="button" data-variant="primary" onclick={saveSettings}>Save settings</button>
				</div>
			</div>
		</div>
	</div>
{/if}
