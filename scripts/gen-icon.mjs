// Generates a fractal-spiral app icon as a PNG using only Node's zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const SIZE = 1024;
const cx = SIZE / 2;
const cy = SIZE / 2;
const R = SIZE * 0.44;

const px = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
	const row = y * (SIZE * 4 + 1);
	px[row] = 0; // filter: none
	for (let x = 0; x < SIZE; x++) {
		const dx = x - cx;
		const dy = y - cy;
		const r = Math.sqrt(dx * dx + dy * dy) / R;
		const a = Math.atan2(dy, dx);

		let cr, cg, cb;
		if (r <= 1.02) {
			// fractal arcs: bands along the radius, hue sweeping with angle
			const bands = 7;
			const pos = r * bands;
			const band = pos % 1;
			const inStroke = band < 0.16 || band > 0.88;
			const hue = ((a / (Math.PI * 2)) * 360 + r * 160) % 360;
			const sat = 0.75 + 0.25 * Math.sin(r * 20);
			const [h, s, l] = [hue, sat, 0.52 + 0.22 * Math.sin(r * 9)];
			const c = hsl(h, s, l);
			const edge = Math.max(0, 1 - Math.abs(r - 1) * 4);
			const core = r < 0.12 ? 1 : 0; // dark core
			const alpha = inStroke ? Math.min(1, edge + 0.25) : 0;
			cr = c[0] * alpha + 13 * (1 - alpha);
			cg = c[1] * alpha + 14 * (1 - alpha);
			cb = c[2] * alpha + 20 * (1 - alpha);
			if (core) {
				cr = 10;
				cg = 12;
				cb = 18;
			}
		} else {
			cr = 13;
			cg = 14;
			cb = 20;
		}
		const i = row + 1 + x * 4;
		px[i] = cr;
		px[i + 1] = cg;
		px[i + 2] = cb;
		px[i + 3] = 255;
	}
}

function hsl(h, s, l) {
	h = ((h % 360) + 360) % 360;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
	return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function crc32(buf) {
	let c;
	const table = crc32.table || (crc32.table = (() => {
		const t = new Int32Array(256);
		for (let n = 0; n < 256; n++) {
			c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			t[n] = c;
		}
		return t;
	})());
	let crc = -1;
	for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
	return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const typeBuf = Buffer.from(type, 'ascii');
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
	return Buffer.concat([len, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const idat = deflateSync(px, { level: 9 });

const png = Buffer.concat([
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
	chunk('IHDR', ihdr),
	chunk('IDAT', idat),
	chunk('IEND', Buffer.alloc(0))
]);

mkdirSync('src-tauri/icons', { recursive: true });
writeFileSync('src-tauri/icons/icon.png', png);
console.log('wrote src-tauri/icons/icon.png', png.length, 'bytes');
