<script lang="ts">
	import { Download, FileText, Image as ImageIcon, Move, ZoomIn, ZoomOut } from '@lucide/svelte';
	import Icon from './Icon.svelte';
	import { backend } from '../backend';
	import { canvasPos, cardImageUrl, clearCanvas, filteredItems, manifest, placeOnCanvas, setSelected, toast } from '../store.svelte';
	import { exportCanvasAsPdf, downloadBlob } from '../pdf';
	import type { Item } from '../types';

	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let dragState = $state<{ kind: 'pan'; sx: number; sy: number; ox: number; oy: number } | { kind: 'node'; id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);

	$effect(() => {
		// auto-layout items with no position the first time the canvas is opened
		if (manifest.settings.view === 'canvas') {
			let cascade = 0;
			for (const item of filteredItems()) {
				if (!manifest.canvas?.[item.id]) {
					placeOnCanvas(item.id, 40 + (cascade % 5) * 280, 40 + Math.floor(cascade / 5) * 210, 240, 150);
					cascade++;
				}
			}
		}
	});

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const factor = Math.exp(-e.deltaY * 0.0015);
		const next = Math.min(3, Math.max(0.25, zoom * factor));
		// zoom around cursor
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		const wx = (mx - panX) / zoom;
		const wy = (my - panY) / zoom;
		panX = mx - wx * next;
		panY = my - wy * next;
		zoom = next;
	}

	function onPointerDown(e: PointerEvent) {
		const target = e.target as HTMLElement;
		const nodeEl = target.closest?.('[data-canvas-node]') as HTMLElement | null;
		if (nodeEl) {
			const id = nodeEl.dataset.canvasNode!;
			dragState = { kind: 'node', id, sx: e.clientX, sy: e.clientY, ox: canvasPosById(id).x, oy: canvasPosById(id).y };
			nodeEl.setPointerCapture(e.pointerId);
		} else {
			dragState = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: panX, oy: panY };
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragState) return;
		const dx = e.clientX - dragState.sx;
		const dy = e.clientY - dragState.sy;
		if (dragState.kind === 'pan') {
			panX = dragState.ox + dx;
			panY = dragState.oy + dy;
		} else {
			const pos = canvasPosById(dragState.id);
			placeOnCanvas(dragState.id, dragState.ox + dx / zoom, dragState.oy + dy / zoom, pos.w, pos.h);
		}
	}

	function onPointerUp() {
		dragState = null;
	}

	function canvasPosById(id: string) {
		const item = manifest.items.find((i) => i.id === id);
		return item ? canvasPos(item) : { x: 0, y: 0, w: 240, h: 150 };
	}

	function resetView() {
		zoom = 1;
		panX = 40;
		panY = 40;
	}

	async function exportPng() {
		const canvas = await renderCanvas();
		if (!canvas) return;
		await new Promise<void>((resolve) => canvas.toBlob((b) => {
			if (b) downloadBlob(b, 'fractalgrab-canvas.png');
			resolve();
		}, 'image/png'));
		toast('Canvas exported as PNG', 'success');
	}

	async function exportPdf() {
		const canvas = await renderCanvas();
		if (!canvas) return;
		await exportCanvasAsPdf(canvas, 'fractalgrab-canvas.pdf');
		toast('Canvas exported as PDF', 'success');
	}

	async function renderCanvas(): Promise<HTMLCanvasElement | null> {
		const items = manifest.items.filter((i) => manifest.canvas?.[i.id]);
		if (!items.length) return null;
		// compute bounds
		let maxX = 0;
		let maxY = 0;
		for (const item of items) {
			const p = canvasPos(item);
			maxX = Math.max(maxX, p.x + p.w);
			maxY = Math.max(maxY, p.y + p.h);
		}
		const W = Math.max(800, maxX + 120);
		const H = Math.max(600, maxY + 120);
		const canvas = document.createElement('canvas');
		canvas.width = W;
		canvas.height = H;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.fillStyle = '#f4f4f6';
		ctx.fillRect(0, 0, W, H);
		// dot grid
		ctx.fillStyle = '#e2e4ea';
		for (let x = 20; x < W; x += 40) for (let y = 20; y < H; y += 40) ctx.fillRect(x, y, 2, 2);

		for (const item of items) {
			const p = canvasPos(item);
			const url = cardImageUrl(item);
			if (url) {
				try {
					const img = await loadImage(url);
					ctx.save();
					ctx.shadowColor = 'rgba(0,0,0,0.25)';
					ctx.shadowBlur = 12;
					ctx.shadowOffsetY = 4;
					ctx.fillStyle = '#ffffff';
					roundRect(ctx, p.x, p.y, p.w, p.h, 10);
					ctx.fill();
					ctx.restore();
					ctx.save();
					roundRect(ctx, p.x, p.y, p.w, p.h, 10);
					ctx.clip();
					ctx.drawImage(img, p.x, p.y, p.w, p.h - 26);
					ctx.restore();
				} catch {
					drawFallback(ctx, item, p);
				}
			} else {
				drawFallback(ctx, item, p);
			}
			// label
			ctx.fillStyle = '#111827';
			ctx.font = '600 13px system-ui, sans-serif';
			ctx.textBaseline = 'middle';
			ctx.fillText(item.title.slice(0, 34), p.x + 10, p.y + p.h - 13, p.w - 20);
		}
		return canvas;
	}

	function drawFallback(ctx: CanvasRenderingContext2D, item: Item, p: { x: number; y: number; w: number; h: number }) {
		ctx.fillStyle = item.colors?.[0] ?? '#334155';
		roundRect(ctx, p.x, p.y, p.w, p.h, 10);
		ctx.fill();
		ctx.fillStyle = 'rgba(255,255,255,0.9)';
		ctx.font = '700 40px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText((item.title[0] ?? '?').toUpperCase(), p.x + p.w / 2, p.y + p.h / 2 - 12);
		ctx.textAlign = 'left';
		ctx.fillStyle = '#111827';
		ctx.font = '600 13px system-ui, sans-serif';
		ctx.fillText(item.title.slice(0, 34), p.x + 10, p.y + p.h - 13, p.w - 20);
	}

	function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.arcTo(x + w, y, x + w, y + h, r);
		ctx.arcTo(x + w, y + h, x, y + h, r);
		ctx.arcTo(x, y + h, x, y, r);
		ctx.arcTo(x, y, x + w, y, r);
		ctx.closePath();
	}

	function loadImage(url: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = url;
		});
	}
</script>

<div
	class="canvas {dragState?.kind === 'pan' ? 'dragging' : ''}"
	onwheel={onWheel}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	style="touch-action:none;"
>
	<div class="canvas-inner" style="transform: translate({panX}px, {panY}px) scale({zoom});">
		{#each filteredItems() as item (item.id)}
			{@const p = canvasPos(item)}
			<div
				class="canvas-node"
				style="left:{p.x}px; top:{p.y}px; width:{p.w}px; height:{p.h}px;"
				data-canvas-node={item.id}
				data-item-id={item.id}
				onpointerdown={(e) => e.stopPropagation()}
				ondblclick={() => setSelected(item.id)}
			>
				{#if cardImageUrl(item)}
					<img src={cardImageUrl(item)} alt={item.title} draggable="false" />
				{:else}
					<div
						style="flex:1; display:flex; align-items:center; justify-content:center; background:{item.colors?.[0] ?? 'var(--bg-raised)'}; color:#fff;"
					>
						<Icon name={item.type === 'link' ? 'link' : item.type === 'note' ? 'file-text' : 'image'} size={30} />
					</div>
				{/if}
				<div class="canvas-node-label">{item.title}</div>
			</div>
		{/each}
	</div>

	<div class="row ycenter gap8" style="position:absolute; top:12px; right:12px; z-index:10; background:var(--bg-raised); border:1px solid var(--border); border-radius:10px; padding:4px;">
		<button class="button" data-variant="icon" onclick={() => (zoom = Math.min(3, zoom * 1.25))} title="Zoom in"><ZoomIn size={15} /></button>
		<button class="button" data-variant="icon" onclick={() => (zoom = Math.max(0.25, zoom / 1.25))} title="Zoom out"><ZoomOut size={15} /></button>
		<button class="button" data-variant="icon" onclick={resetView} title="Reset view"><Move size={15} /></button>
		<span style="width:1px; height:18px; background:var(--border); margin:0 2px;"></span>
		<button class="button" data-variant="icon" onclick={exportPng} title="Export PNG"><ImageIcon size={15} /></button>
		<button class="button" data-variant="icon" onclick={exportPdf} title="Export PDF"><FileText size={15} /></button>
		<button class="button" data-variant="icon" onclick={() => { if (confirm('Clear the canvas layout? Items stay in your library.')) clearCanvas(); }} title="Clear layout"><Download size={15} style="display:none;" /><span style="font-size:13px;">✕</span></button>
	</div>

	<div class="canvas-hint">Scroll to zoom · drag empty space to pan · drag items to arrange · double-click to open</div>
</div>
