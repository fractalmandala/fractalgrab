<script lang="ts">
	let { count = 3, variant = 'card' }: { count?: number; variant?: 'card' | 'list' | 'row' } = $props();
</script>

<div class="skeleton-grid" class:list-view={variant === 'list'} class:row-view={variant === 'row'}>
	{#each Array(count) as _, i}
		<div class="skeleton-item" style="animation-delay: {i * 80}ms">
			{#if variant === 'card'}
				<div class="skel skel-image"></div>
				<div class="skel skel-title"></div>
				<div class="skel skel-text"></div>
			{:else if variant === 'list'}
				<div class="skel skel-avatar"></div>
				<div class="skel-col">
					<div class="skel skel-title"></div>
					<div class="skel skel-text" style="width:60%"></div>
				</div>
			{:else}
				<div class="skel skel-text" style="width:80%"></div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.skeleton-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 14px;
		padding: 16px;
	}
	.skeleton-grid.list-view {
		grid-template-columns: 1fr;
	}
	.skeleton-grid.row-view {
		grid-template-columns: 1fr;
	}
	.skeleton-item {
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		animation: skeletonFade 0.6s ease both;
	}
	.skel {
		border-radius: 6px;
		background: linear-gradient(
			90deg,
			var(--bg-sunken) 25%,
			color-mix(in srgb, var(--bg-sunken) 60%, var(--border)) 50%,
			var(--bg-sunken) 75%
		);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite;
	}
	.skel-image {
		height: 120px;
		border-radius: 8px;
	}
	.skel-title {
		height: 14px;
		width: 70%;
	}
	.skel-text {
		height: 10px;
		width: 90%;
	}
	.skel-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.skel-col {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
	}
	.list-view .skeleton-item {
		flex-direction: row;
		align-items: center;
	}
	@keyframes shimmer {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
	}
	@keyframes skeletonFade {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}
</style>
