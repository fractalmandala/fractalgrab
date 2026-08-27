// Serializes a rich-editor block element back to Markdown source.
//
// The rich editor is a structured editor: the DOM holds semantic content
// (<strong> is real bold), so serialization is deterministic. Text content is
// escaped so literal `*`, `_`, backticks, brackets, and line-leading markers
// round-trip through a re-parse without changing meaning.

function escapeText(text: string): string {
	let out = text.replace(/\\/g, '\\\\').replace(/\*/g, '\\*').replace(/_/g, '\\_');
	out = out.replace(/`/g, '\\`').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
	// Escape line-leading markers so a paragraph never re-parses as a heading,
	// list, quote, or thematic break.
	return out
		.split('\n')
		.map((line) => line.replace(/^(#{1,6})\s/, '\\$1 ').replace(/^([-+*])\s/, '\\$1 ').replace(/^(\d+[.)])\s/, '\\$1 ').replace(/^>\s?/, '\\> ').replace(/^---+\s*$/, '\\---'))
		.join('\n');
}

function escapeUrl(url: string): string {
	return url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/ /g, '%20');
}

function inlineCode(content: string): string {
	if (!content.includes('`')) return `\`${content}\``;
	const ticks = '`'.repeat(Math.max(2, content.split('`').length));
	return `${ticks} ${content} ${ticks}`;
}

/** Serialize inline children of `node` (text nodes and inline elements). */
function inline(node: Node): string {
	let out = '';
	for (const child of node.childNodes) {
		if (child.nodeType === Node.TEXT_NODE) {
			out += escapeText(child.textContent ?? '');
			continue;
		}
		if (child.nodeType !== Node.ELEMENT_NODE) continue;
		const el = child as HTMLElement;
		switch (el.tagName.toLowerCase()) {
			case 'strong':
			case 'b':
				out += `**${inline(el)}**`;
				break;
			case 'em':
			case 'i':
				out += `*${inline(el)}*`;
				break;
			case 'del':
			case 's':
			case 'strike':
				out += `~~${inline(el)}~~`;
				break;
			case 'code':
				// Code spans are literal: extract raw text, no escaping.
				out += inlineCode(rawText(el));
				break;
			case 'a':
				out += `[${inline(el)}](${escapeUrl(el.getAttribute('href') ?? '')})`;
				break;
			case 'img': {
				const alt = el.getAttribute('alt') ?? '';
				// data-md-src carries the markdown-relative path; the displayed src
				// is resolved to a file URL for rendering.
				const src = el.dataset.mdSrc ?? el.getAttribute('src') ?? '';
				out += `![${alt}](${escapeUrl(src)})`;
				break;
			}
			case 'br':
				out += '\n';
				break;
			case 'ul':
			case 'ol':
				// A list nested inside inline content (shouldn't happen in normal
				// editing) — serialize it as a list.
				out += '\n' + serializeList(el, 0);
				break;
			case 'li':
				out += serializeListItem(el, 0);
				break;
			default:
				out += inline(el);
		}
	}
	return out;
}

function rawText(el: HTMLElement): string {
	return el.textContent ?? '';
}

function serializeListItem(li: HTMLElement, depth: number): string {
	const indent = '  '.repeat(depth);
	const parent = li.parentElement;
	const ordered = parent?.tagName.toLowerCase() === 'ol';
	let marker = ordered ? '1. ' : '- ';
	if (ordered) {
		const start = Number(parent?.getAttribute('start')) || 1;
		const idx = [...(parent?.children ?? [])].indexOf(li) + 1;
		marker = `${start + idx - 1}. `;
	}
	// Task list checkbox.
	const checkbox = li.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null;
	if (checkbox) {
		marker = checkbox.checked ? '- [x] ' : '- [ ] ';
	}

	// Collect text/continuation lines and separately-serialized nested lists,
	// so nested list lines keep their own indentation and are not re-indented.
	const textLines: string[] = [];
	const nestedLists: string[] = [];
	for (const child of li.childNodes) {
		if (child.nodeType === Node.TEXT_NODE) {
			textLines.push(...escapeText(child.textContent ?? '').split('\n'));
		} else if (child.nodeType === Node.ELEMENT_NODE) {
			const el = child as HTMLElement;
			const tag = el.tagName.toLowerCase();
			if (tag === 'ul' || tag === 'ol') {
				nestedLists.push(serializeList(el, depth + 1));
			} else if (tag !== 'input') {
				textLines.push(...inline(el).split('\n'));
			}
		}
	}

	let firstText = textLines[0] ?? '';
	if (checkbox) firstText = firstText.replace(/^\s+/, '');
	const first = `${indent}${marker}${firstText}`;
	const rest = textLines.slice(1).map((l) => (l.trim() === '' ? '' : `${indent}  ${l}`));
	return [first, ...rest, ...nestedLists].join('\n');
}

function serializeList(list: HTMLElement, depth: number): string {
	let out = '';
	for (const li of list.children) {
		if ((li as HTMLElement).tagName.toLowerCase() === 'li') {
			out += serializeListItem(li as HTMLElement, depth) + '\n';
		}
	}
	return out.replace(/\n$/, '');
}

/** Serialize a block element (div/p, h1–h6, blockquote, ul/ol) to Markdown. */
export function domToMarkdown(root: HTMLElement): string {
	const tag = root.tagName.toLowerCase();
	if (tag === 'ul' || tag === 'ol') return serializeList(root, 0);
	if (tag === 'blockquote') {
		const content = inline(root).trim();
		return content
			.split('\n')
			.map((l) => (l.trim() === '' ? '>' : `> ${l}`))
			.join('\n');
	}
	const m = tag.match(/^h([1-6])$/);
	if (m) {
		return `${'#'.repeat(Number(m[1]))} ${inline(root)}`.trimEnd();
	}
	return inline(root).trim();
}
