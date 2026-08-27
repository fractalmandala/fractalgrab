const enc = new TextEncoder();

function ascii(s: string): Uint8Array {
	return enc.encode(s);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
	const out = new Uint8Array(a.length + b.length);
	out.set(a, 0);
	out.set(b, a.length);
	return out;
}

/**
 * Build a multi-page A4 PDF from JPEG data URLs.
 * Pages are laid out left-to-right, top-to-bottom over the source canvas.
 */
export function buildPdf(jpegs: string[], w: number, h: number): Uint8Array {
	const imgs = jpegs.map((j) => base64ToBytes(j.split(',')[1]));
	const n = imgs.length;
	const chunks: Uint8Array[] = [];
	const offsets: number[] = [];
	let pos = 0;

	const push = (bytes: Uint8Array) => {
		chunks.push(bytes);
		pos += bytes.length;
	};

	const header = ascii('%PDF-1.4\n');
	push(header);

	offsets[1] = pos;
	push(ascii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));

	offsets[2] = pos;
	let kids = '';
	for (let i = 0; i < n; i++) kids += `${3 + i * 3} 0 R `;
	push(ascii(`2 0 obj\n<< /Type /Pages /Kids [ ${kids.trim()} ] /Count ${n} >>\nendobj\n`));

	for (let i = 0; i < n; i++) {
		const pageObj = 3 + i * 3;
		const contentObj = pageObj + 1;
		const imageObj = pageObj + 2;
		const content = ascii(`q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`);

		offsets[pageObj] = pos;
		push(
			ascii(
				`${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imageObj} 0 R >> >> /Contents ${contentObj} 0 R >>\nendobj\n`
			)
		);

		offsets[contentObj] = pos;
		push(ascii(`${contentObj} 0 obj\n<< /Length ${content.length} >>\nstream\n`));
		push(content);
		push(ascii('endstream\nendobj\n'));

		offsets[imageObj] = pos;
		push(
			ascii(
				`${imageObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgs[i].length} >>\nstream\n`
			)
		);
		push(imgs[i]);
		push(ascii('endstream\nendobj\n'));
	}

	const xrefPos = pos;
	const size = offsets.length;
	let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
	for (let i = 1; i < size; i++) {
		xref += `${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`;
	}
	const trailer = `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
	push(ascii(xref + trailer));

	let out: Uint8Array = new Uint8Array(0);
	for (const c of chunks) out = concat(out, c);
	return out;
}

export function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Tile a canvas across A4 pages at 150 dpi and download the PDF. */
export async function exportCanvasAsPdf(canvas: HTMLCanvasElement, filename = 'canvas.pdf') {
	const PX_PER_MM = 150 / 25.4;
	const pageW = Math.round(210 * PX_PER_MM);
	const pageH = Math.round(297 * PX_PER_MM);
	const jpegs: string[] = [];
	let offsetX = 0;
	while (offsetX < canvas.width) {
		let offsetY = 0;
		while (offsetY < canvas.height) {
			const tile = document.createElement('canvas');
			tile.width = pageW;
			tile.height = pageH;
			const tctx = tile.getContext('2d');
			if (tctx) {
				tctx.fillStyle = '#ffffff';
				tctx.fillRect(0, 0, pageW, pageH);
				tctx.drawImage(canvas, offsetX, offsetY, pageW, pageH, 0, 0, pageW, pageH);
			}
			jpegs.push(tile.toDataURL('image/jpeg', 0.85));
			offsetY += pageH;
		}
		offsetX += pageW;
	}
	const bytes = buildPdf(jpegs, pageW, pageH);
	downloadBlob(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), filename);
}
