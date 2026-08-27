<script lang="ts">
	import { toasts } from '../store.svelte';
</script>

<div class="toasts">
	{#each toasts as t (t.id)}
		<div class="toast" data-kind={t.kind}>{t.msg}</div>
	{/each}
</div>
