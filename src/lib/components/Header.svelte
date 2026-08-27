<script lang="ts">
	import {
		setSearch,
		clearAiSearch,
		ui,
		runAiSearch,
		setColor,
		aiReady,
		manifest,
		toast,
		openCapture,
		openSettings,
	} from "$lib/store.svelte";
	import { colorName } from "$lib/color";
	import { Search, Sparkles, Plus, Settings, X, Palette } from "@lucide/svelte";

	let colorSearchOpen = $state(false);

	const paletteChips = $derived.by(() => {
		const seen = new Map<string, number>();
		for (const item of manifest.items) {
			for (const c of item.colors ?? []) {
				seen.set(c, (seen.get(c) ?? 0) + 1);
			}
		}
		return [...seen.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 18)
			.map(([hex]) => hex);
	});

	function toggleColour(hex: string) {
		const next = ui.activeColorSearch === hex ? null : hex;
		setColor(next);
		colorSearchOpen = false;
		if (next) toast(`Showing ${colorName(hex)} items`, "info");
	}

	function clearSearch() {
		setSearch("");
		setColor(null);
		clearAiSearch();
	}
	async function aiSearchNow() {
		await runAiSearch();
	}
</script>

<header class="row appheader ycenter xbetween">
	<div class="logo row ycenter gap8">
		<img class="logomotif" src="/images/logomotif.png" alt="motif" />
	</div>
	<div class="row ycenter gap16">
	<div class="row search-input ycenter gap8">
		<Search size={12} />
		<input
			id="app-search"
			placeholder=""
			value={ui.searchQuery}
			oninput={(e) => {
				setSearch(e.currentTarget.value);
				clearAiSearch();
			}}
			onkeydown={(e) => {
				if (e.key === "Enter" && !e.shiftKey) aiSearchNow();
			}}
		/>
		{#if ui.searchQuery || ui.activeColorSearch}
			<button
				class="button"
				data-variant="icon"
				onclick={clearSearch}
				title="Clear search"
			>
				<X size={16} />
			</button>
		{/if}
		{#if aiReady()}
			<button
				class="button"
				data-variant="quiet"
				data-size="sm"
				onclick={aiSearchNow}
				disabled={ui.busy || !ui.searchQuery.trim()}
				title="Full-sentence AI search"
			>
				<Sparkles size={12} /> AI
			</button>
		{/if}
	</div>
		<div style="position:relative;">
			<button
				class="button is-icon"
				title="Search by colour"
				onclick={() => (colorSearchOpen = !colorSearchOpen)}
			>
				<Palette size={16}/>
			</button>
			{#if colorSearchOpen}
				<div
					style="position:absolute; right:0; top:36px; background:var(--bg-surface); border:1px solid var(--border); border-radius:12px; padding:10px; box-shadow:var(--shadow-lg); z-index:50; width:220px;"
				>
					<div class="chips">
						{#each paletteChips as hex}
							<button
								class="color-dot"
								style="width:22px; height:22px; background:{hex}; {ui.activeColorSearch ===
								hex
									? 'outline: 2px solid var(--theme);'
									: ''}"
								title={colorName(hex)}
								onclick={() => toggleColour(hex)}
							></button>
						{/each}
					</div>
					{#if !paletteChips.length}
						<p class="text-xs text-muted" style="margin:0;">
							Save images to build a colour palette.
						</p>
					{/if}
				</div>
			{/if}
		</div>
		<button class="button is-icon" onclick={openCapture}>
			<Plus size={16} />
		</button>
		<button class="button is-icon" onclick={openSettings}>
			<Settings size={16} />
		</button>
	</div>
</header>
