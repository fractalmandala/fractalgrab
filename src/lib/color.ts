export function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	if (h.length === 3) {
		return [
			parseInt(h[0] + h[0], 16),
			parseInt(h[1] + h[1], 16),
			parseInt(h[2] + h[2], 16)
		];
	}
	const n = parseInt(h.slice(0, 6), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
	const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
	return `#${to(r)}${to(g)}${to(b)}`;
}

/** Simple perceptual-ish distance in RGB space (weighted). */
export function colorDistance(a: string, b: string): number {
	const [r1, g1, b1] = hexToRgb(a);
	const [r2, g2, b2] = hexToRgb(b);
	const rmean = (r1 + r2) / 2;
	const dr = r1 - r2;
	const dg = g1 - g2;
	const db = b1 - b2;
	return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
}

/** Extract a palette from an image element by sampling its pixels. */
export function extractPalette(img: HTMLImageElement, n = 5): string[] {
	const size = 96;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) return [];
	try {
		ctx.drawImage(img, 0, 0, size, size);
		const data = ctx.getImageData(0, 0, size, size).data;
		const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
		for (let i = 0; i < data.length; i += 4) {
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];
			const a = data[i + 3];
			if (a < 100) continue;
			// 5-bit quantization bucket
			const key = `${r >> 5},${g >> 5},${b >> 5}`;
			const existing = buckets.get(key);
			if (existing) {
				existing.r += r;
				existing.g += g;
				existing.b += b;
				existing.count++;
			} else {
				buckets.set(key, { r, g, b, count: 1 });
			}
		}
		const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
		return sorted
			.slice(0, n)
			.map((b) => rgbToHex(b.r / b.count, b.g / b.count, b.b / b.count));
	} catch {
		return [];
	}
}

const NAMED: [string, string][] = [
	['red', '#e6194b'], ['crimson', '#dc143c'], ['orange', '#f58231'], ['amber', '#ffbf00'],
	['gold', '#ffd700'], ['yellow', '#ffe119'], ['lime', '#aaff00'], ['green', '#3cb44b'],
	['emerald', '#10b981'], ['teal', '#469990'], ['cyan', '#00bcd4'], ['sky blue', '#87ceeb'],
	['blue', '#4363d8'], ['navy', '#000080'], ['indigo', '#4b0082'], ['purple', '#911eb4'],
	['violet', '#ee82ee'], ['magenta', '#f032e6'], ['pink', '#fabebe'], ['rose', '#ff1493'],
	['brown', '#9a6324'], ['tan', '#d2b48c'], ['beige', '#f5f5dc'], ['grey', '#808080'],
	['silver', '#c0c0c0'], ['white', '#ffffff'], ['black', '#000000'], ['charcoal', '#36454f'],
	['slate', '#708090'], ['lavender', '#e6e6fa'], ['maroon', '#800000'], ['olive', '#808000'],
	['coral', '#ff7f50'], ['salmon', '#fa8072'], ['turquoise', '#40e0d0'], ['mint', '#98ff98'],
	['peach', '#ffdab9'], ['periwinkle', '#ccccff'], ['rust', '#b7410e'], ['moss', '#8a9a5b'],
	['sand', '#c2b280'], ['cream', '#fffdd0'], ['ink', '#1a1a2e'], ['midnight', '#191970']
];

export function colorName(hex: string): string {
	let best = 'unknown';
	let bestDist = Infinity;
	for (const [name, namedHex] of NAMED) {
		const d = colorDistance(hex, namedHex);
		if (d < bestDist) {
			bestDist = d;
			best = name;
		}
	}
	return bestDist > 130 ? hex : best;
}

export function readableOn(hex: string): string {
	const [r, g, b] = hexToRgb(hex);
	const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return lum > 0.6 ? '#111827' : '#ffffff';
}

export function withAlpha(hex: string, alpha: number): string {
	const [r, g, b] = hexToRgb(hex);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}
