export interface ImportedItem {
	title: string;
	url?: string;
	note?: string;
	tags: string[];
	folders: string[];
}

function parseCsvRows(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			field = '';
			if (row.some((x) => x.trim())) rows.push(row);
			row = [];
		} else {
			field += c;
		}
	}
	row.push(field);
	if (row.some((x) => x.trim())) rows.push(row);
	return rows;
}

export function parseCsv(text: string): ImportedItem[] {
	const rows = parseCsvRows(text);
	if (!rows.length) return [];
	const first = rows[0].map((h) => h.toLowerCase().trim());
	const urlIdx = first.indexOf('url') !== -1 ? first.indexOf('url') : first.indexOf('link');
	const titleIdx = first.indexOf('title') !== -1 ? first.indexOf('title') : first.indexOf('name');
	const tagsIdx = first.indexOf('tags');
	const noteIdx = first.indexOf('note') !== -1 ? first.indexOf('note') : first.indexOf('description');
	const hasHeader = urlIdx !== -1 || titleIdx !== -1;
	const data = hasHeader ? rows.slice(1) : rows;
	return data
		.map((r) => {
			const url = r[urlIdx === -1 ? 0 : urlIdx]?.trim() ?? '';
			const title = (titleIdx !== -1 ? r[titleIdx] : r[1])?.trim() ?? url;
			const tags = (tagsIdx !== -1 ? r[tagsIdx] : r[2])
				?.split(/[;,]/)
				.map((t) => t.trim())
				.filter(Boolean) ?? [];
			const note = noteIdx !== -1 ? r[noteIdx]?.trim() : undefined;
			return { title: title || url || 'Untitled', url: url || undefined, note, tags, folders: [] };
		})
		.filter((i) => i.title !== 'Untitled' || i.url);
}

export function parseJson(text: string): ImportedItem[] {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return [];
	}
	const arr = Array.isArray(data) ? data : (data as { items?: unknown[] }).items ?? [];
	return arr
		.map((raw: any) => {
			if (typeof raw === 'string') return { title: raw, tags: [], folders: [] };
			const url =
				(typeof raw.url === 'string' ? raw.url : undefined) ??
				(typeof raw.href === 'string' ? raw.href : undefined) ??
				(typeof raw.link === 'string' ? raw.link : undefined) ??
				(typeof raw.uri === 'string' ? raw.uri : undefined);
			const title =
				(typeof raw.title === 'string' ? raw.title : undefined) ??
				(typeof raw.name === 'string' ? raw.name : undefined) ??
				url ??
				'Untitled';
			const tags = Array.isArray(raw.tags) ? raw.tags.map(String) : [];
			const note = typeof raw.note === 'string' ? raw.note : undefined;
			return { title, url, note, tags, folders: [] };
		})
		.filter((i) => i.title);
}

export function parseBookmarksHtml(text: string): ImportedItem[] {
	const doc = new DOMParser().parseFromString(text, 'text/html');
	const out: ImportedItem[] = [];
	const walk = (node: Element, folders: string[]) => {
		for (const child of Array.from(node.children)) {
			if (child.tagName === 'H3') {
				const name = child.textContent?.trim() || 'Folder';
				walk(child, [...folders, name]);
			} else if (child.tagName === 'A') {
				const url = child.getAttribute('href') || '';
				const title = child.textContent?.trim() || url || 'Untitled';
				const tags = (child.getAttribute('tags') || '')
					.split(',')
					.map((t) => t.trim())
					.filter(Boolean);
				out.push({ title, url: url || undefined, tags, folders });
			} else {
				walk(child, folders);
			}
		}
	};
	walk(doc.body, []);
	return out;
}
