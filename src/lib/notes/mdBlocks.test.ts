import { describe, expect, it } from 'vitest';
import { parseDocument, parseFrontmatter, serializeDocument } from './mdBlocks';

describe('parseDocument / serializeDocument', () => {
	it('round-trips a simple document byte-for-byte', () => {
		const src = '# Title\n\nSome **bold** text.\n\n- one\n- two\n';
		expect(serializeDocument(parseDocument(src))).toBe(src);
	});

	it('round-trips without a trailing newline', () => {
		const src = '# Title\n\nLast line';
		expect(serializeDocument(parseDocument(src))).toBe(src);
	});

	it('preserves CRLF line endings', () => {
		const src = '# Title\r\n\r\nBody\r\n';
		const doc = parseDocument(src);
		expect(doc.lineEnding).toBe('\r\n');
		expect(serializeDocument(doc)).toBe(src);
	});

	it('round-trips an empty file', () => {
		const doc = parseDocument('');
		expect(serializeDocument(doc)).toBe('');
	});

	it('gives an empty document one editable blank block', () => {
		const doc = parseDocument('');
		expect(doc.blocks.length).toBe(1);
		expect(doc.blocks[0].kind).toBe('blank');
		expect(doc.blocks[0].readOnly).toBe(false);
	});

	it('splits headings, thematic breaks and paragraphs', () => {
		const doc = parseDocument('# H1\n\n---\n\nBody text here.\n');
		expect(doc.blocks.map((b) => b.kind)).toEqual(['heading', 'blank', 'thematic', 'blank', 'paragraph']);
		expect(doc.blocks[0].source).toBe('# H1');
		expect(doc.blocks[2].source).toBe('---');
	});

	it('groups list lines into one block', () => {
		const doc = parseDocument('- a\n- b\n- c\n');
		expect(doc.blocks.length).toBe(1);
		expect(doc.blocks[0].kind).toBe('list');
		expect(doc.blocks[0].source).toBe('- a\n- b\n- c');
	});

	it('keeps task list lines in the list block', () => {
		const doc = parseDocument('- [ ] todo\n- [x] done\n');
		expect(doc.blocks[0].kind).toBe('list');
		expect(doc.blocks[0].source).toBe('- [ ] todo\n- [x] done');
	});

	it('marks fenced code as read-only and preserves it', () => {
		const src = '```js\nconst a = 1;\n```\n';
		const doc = parseDocument(src);
		expect(doc.blocks[0].kind).toBe('code');
		expect(doc.blocks[0].readOnly).toBe(true);
		expect(serializeDocument(doc)).toBe(src);
	});

	it('marks indented code as read-only', () => {
		const src = '    const a = 1;\n    const b = 2;\n';
		const doc = parseDocument(src);
		expect(doc.blocks[0].kind).toBe('code');
		expect(doc.blocks[0].readOnly).toBe(true);
		expect(serializeDocument(doc)).toBe(src);
	});

	it('marks GFM tables as read-only and preserves them byte-for-byte', () => {
		const src = '| Name | Value |\n| ---- | ----- |\n| a    | 1     |\n';
		const doc = parseDocument(src);
		expect(doc.blocks[0].kind).toBe('table');
		expect(doc.blocks[0].readOnly).toBe(true);
		expect(serializeDocument(doc)).toBe(src);
	});

	it('marks raw HTML blocks as read-only', () => {
		const src = '<div class="x">\nraw <b>html</b>\n</div>\n';
		const doc = parseDocument(src);
		expect(doc.blocks[0].kind).toBe('html');
		expect(doc.blocks[0].readOnly).toBe(true);
		expect(serializeDocument(doc)).toBe(src);
	});

	it('groups blockquote lines into one block', () => {
		const doc = parseDocument('> quote one\n> quote two\n');
		expect(doc.blocks[0].kind).toBe('quote');
		expect(doc.blocks[0].source).toBe('> quote one\n> quote two');
	});

	it('treats leading YAML frontmatter as a read-only block and round-trips it', () => {
		const src = '---\ntitle: My Note\ndescription: About stuff\n---\n\n# My Note\n\nBody text.\n';
		const doc = parseDocument(src);
		expect(doc.blocks[0].kind).toBe('frontmatter');
		expect(doc.blocks[0].readOnly).toBe(true);
		expect(serializeDocument(doc)).toBe(src);
	});

	it('does not treat a bare thematic break as frontmatter', () => {
		const doc = parseDocument('---\n\nBody\n');
		expect(doc.blocks[0].kind).toBe('thematic');
	});

	it('untouched blocks serialize byte-identically when a sibling changes', () => {
		const src = '# Title\n\nA paragraph.\n\n```js\nkeep me\n```\n';
		const doc = parseDocument(src);
		// Simulate editing block index 2 (the paragraph): replace its source.
		const edited = doc.blocks.map((b, i) =>
			i === 2 ? { ...b, source: 'An *edited* paragraph.' } : b
		);
		const out = serializeDocument({ ...doc, blocks: edited });
		expect(out).toBe('# Title\n\nAn *edited* paragraph.\n\n```js\nkeep me\n```\n');
	});
});

describe('parseFrontmatter', () => {
	it('extracts title and description', () => {
		expect(parseFrontmatter('---\ntitle: My Note\ndescription: About it\n---\n\nBody')).toEqual({
			title: 'My Note',
			description: 'About it'
		});
	});

	it('strips surrounding quotes', () => {
		expect(parseFrontmatter('---\ntitle: "Quoted Note"\n---\n')).toEqual({ title: 'Quoted Note' });
		expect(parseFrontmatter("---\ntitle: 'Single'\n---\n")).toEqual({ title: 'Single' });
	});

	it('ignores missing or empty titles', () => {
		expect(parseFrontmatter('---\ntitle:\ndescription: x\n---\n')).toEqual({ description: 'x' });
	});

	it('returns null without frontmatter', () => {
		expect(parseFrontmatter('# Just a heading\n')).toBeNull();
		expect(parseFrontmatter('')).toBeNull();
	});

	it('keeps extra keys untouched', () => {
		expect(parseFrontmatter('---\ntitle: Note\ntags: [a, b]\ncreated: 2024-01-01\n---\n')).toEqual({
			title: 'Note'
		});
	});
});
