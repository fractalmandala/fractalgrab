// Block model for the rich editor.
//
// `parseDocument` splits a markdown source into top-level blocks. Every block
// carries its EXACT source text so that serializing an untouched document
// reproduces the original bytes. Blocks the rich editor cannot safely edit
// (fenced/indented code, GFM tables, raw HTML) are marked `readOnly` and are
// preserved verbatim — the user edits them in raw view.

export type BlockKind =
	| 'frontmatter'
	| 'blank'
	| 'paragraph'
	| 'heading'
	| 'list'
	| 'quote'
	| 'code'
	| 'table'
	| 'html'
	| 'thematic';

export interface Block {
	kind: BlockKind;
	/** Exact source text of the block, without a trailing newline. */
	source: string;
	/** True for code / table / html — rendered but not editable in rich view. */
	readOnly: boolean;
}

export interface MdDocument {
	blocks: Block[];
	lineEnding: '\n' | '\r\n';
	trailingNewline: boolean;
}

const isBlank = (line: string) => /^\s*$/.test(line);
const isFenceStart = (line: string) => /^( {0,3})(`{3,}|~{3,})/.test(line);
const isIndentedCode = (line: string) => /^( {4}|\t)/.test(line) && !isBlank(line);
const isHtmlStart = (line: string) => /^\s*<(?:[a-zA-Z!/?])/.test(line) && !isBlank(line);
const isHeading = (line: string) => /^ {0,3}#{1,6}(?:\s+|$)/.test(line);
const isThematic = (line: string) => /^ {0,3}(?:(\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})[ \t]*$/.test(line);
const isListItem = (line: string) => /^( {0,3})([-*+]|\d+[.)])(\s+|$)/.test(line);
const isQuote = (line: string) => /^ {0,3}>/.test(line);
const isTableSep = (line: string) =>
	line.includes('|') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line);

function looksLikeHtmlTag(line: string): boolean {
	const t = line.trimStart();
	if (!t.startsWith('<')) return false;
	return /^<(?:[a-zA-Z][a-zA-Z0-9-]*|!|--|\?|\/)[\s>]/.test(t);
}

export function parseDocument(source: string): MdDocument {
	const trailingNewline = source.endsWith('\n') || source.endsWith('\r');
	const lineEnding: '\n' | '\r\n' = source.includes('\r\n') ? '\r\n' : '\n';
	// An empty document still yields one blank block so the rich editor
	// always has an editable target to type into (serializes back to '').
	if (source === '') {
		return { blocks: [{ kind: 'blank', source: '', readOnly: false }], lineEnding, trailingNewline: false };
	}
	const lines = source.split(/\r?\n/);
	// A source ending with a newline yields a final empty element that
	// represents the trailing newline itself, not a blank block.
	if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
	const blocks: Block[] = [];
	let i = 0;

	const push = (kind: BlockKind, from: number, to: number) => {
		const src = lines.slice(from, to).join('\n');
		const readOnly = kind === 'code' || kind === 'table' || kind === 'html' || kind === 'frontmatter';
		blocks.push({ kind, source: src, readOnly });
	};

	while (i < lines.length) {
		const line = lines[i];

		// YAML frontmatter: a `---` line at the very start, closed by another
		// `---` line. Treated as a read-only block so it round-trips verbatim.
		if (i === 0 && line.trim() === '---') {
			let j = 1;
			while (j < lines.length && lines[j].trim() !== '---') j++;
			if (j < lines.length) {
				push('frontmatter', 0, j + 1);
				i = j + 1;
				continue;
			}
			// No closing fence — fall through (treat as a thematic break).
		}

		if (isBlank(line)) {
			let j = i;
			while (j < lines.length && isBlank(lines[j])) j++;
			push('blank', i, j);
			i = j;
			continue;
		}

		if (isFenceStart(line)) {
			const m = line.match(/^ {0,3}(`{3,}|~{3,})/);
			const fence = m![1];
			const closer = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`);
			let j = i + 1;
			while (j < lines.length && !closer.test(lines[j])) j++;
			push('code', i, Math.min(j + 1, lines.length));
			i = j + 1;
			continue;
		}

		if (isIndentedCode(line)) {
			let j = i;
			while (j < lines.length && (isIndentedCode(lines[j]) || isBlank(lines[j]))) {
				if (isBlank(lines[j])) {
					// A blank line only stays part of the code block if another
					// indented line follows it.
					let k = j + 1;
					while (k < lines.length && isBlank(lines[k])) k++;
					if (k >= lines.length || !isIndentedCode(lines[k])) break;
					j = k;
				} else {
					j++;
				}
			}
			push('code', i, j);
			i = j;
			continue;
		}

		if (looksLikeHtmlTag(line)) {
			let j = i;
			while (j < lines.length && !isBlank(lines[j])) j++;
			push('html', i, j);
			i = j;
			continue;
		}

		// GFM table: header row containing `|` followed by a delimiter row.
		if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
			let j = i + 2;
			while (j < lines.length && !isBlank(lines[j]) && lines[j].includes('|')) j++;
			push('table', i, j);
			i = j;
			continue;
		}

		if (isHeading(line)) {
			push('heading', i, i + 1);
			i++;
			continue;
		}

		if (isThematic(line)) {
			push('thematic', i, i + 1);
			i++;
			continue;
		}

		if (isListItem(line)) {
			let j = i + 1;
			while (j < lines.length) {
				const l = lines[j];
				if (isBlank(l)) {
					// A blank line stays inside the list if a list item follows.
					let k = j + 1;
					while (k < lines.length && isBlank(lines[k])) k++;
					if (k >= lines.length || !isListItem(lines[k])) break;
					j = k;
				} else if (isListItem(l)) {
					j++;
				} else if (/^ {2,}\S/.test(l)) {
					// Indented continuation of the previous item.
					j++;
				} else {
					break;
				}
			}
			push('list', i, j);
			i = j;
			continue;
		}

		if (isQuote(line)) {
			let j = i;
			while (j < lines.length && (isQuote(lines[j]) || isBlank(lines[j]))) {
				if (isBlank(lines[j])) {
					let k = j + 1;
					while (k < lines.length && isBlank(lines[k])) k++;
					if (k >= lines.length || !isQuote(lines[k])) break;
					j = k;
				} else {
					j++;
				}
			}
			push('quote', i, j);
			i = j;
			continue;
		}

		// Paragraph: consecutive non-blank, non-special lines.
		let j = i;
		while (
			j < lines.length &&
			!isBlank(lines[j]) &&
			!isFenceStart(lines[j]) &&
			!isIndentedCode(lines[j]) &&
			!looksLikeHtmlTag(lines[j]) &&
			!isHeading(lines[j]) &&
			!isThematic(lines[j]) &&
			!isListItem(lines[j]) &&
			!isQuote(lines[j]) &&
			!isTableSep(lines[j]) &&
			!(
				lines[j].includes('|') &&
				j + 1 < lines.length &&
				isTableSep(lines[j + 1])
			)
		) {
			j++;
		}
		push('paragraph', i, j);
		i = j;
	}

	return { blocks, lineEnding, trailingNewline };
}

export interface FrontmatterMeta {
	title?: string;
	description?: string;
}

/**
 * Parse the title/description out of leading YAML frontmatter. Returns null
 * when the source has no (well-formed) frontmatter block.
 */
export function parseFrontmatter(source: string): FrontmatterMeta | null {
	const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!m) return null;
	const out: FrontmatterMeta = {};
	for (const line of m[1].split(/\r?\n/)) {
		const kv = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/);
		if (!kv) continue;
		const key = kv[1].toLowerCase();
		const val = kv[2].replace(/^["']|["']$/g, '').trim();
		if (key === 'title' && val) out.title = val;
		else if (key === 'description' && val) out.description = val;
	}
	return out;
}

export function serializeDocument(doc: MdDocument): string {
	const body = doc.blocks.map((b) => b.source).join(doc.lineEnding);
	if (doc.blocks.length === 0) return doc.trailingNewline ? doc.lineEnding : '';
	return doc.trailingNewline ? body + doc.lineEnding : body;
}

/** Re-serialize a document after some blocks were edited (sources replaced). */
export function reparseEdited(blocks: Block[], lineEnding: '\n' | '\r\n', trailingNewline: boolean): string {
	return serializeDocument({ blocks, lineEnding, trailingNewline });
}
