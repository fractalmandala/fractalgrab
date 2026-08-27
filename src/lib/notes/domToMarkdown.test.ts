import { describe, expect, it } from 'vitest';
import { domToMarkdown } from './domToMarkdown';

function el(html: string): HTMLElement {
	const div = document.createElement('div');
	div.innerHTML = html;
	return div.firstElementChild as HTMLElement;
}

describe('domToMarkdown', () => {
	it('serializes a paragraph with bold, italic, strikethrough and code', () => {
		const root = el('<div>Hello <strong>bold</strong>, <em>italic</em>, <del>gone</del> and <code>x = 1</code>.</div>');
		expect(domToMarkdown(root)).toBe('Hello **bold**, *italic*, ~~gone~~ and `x = 1`.');
	});

	it('escapes literal markdown characters in text', () => {
		const root = el('<div>Price: 2 * 3, a_b, [x]</div>');
		expect(domToMarkdown(root)).toBe('Price: 2 \\* 3, a\\_b, \\[x\\]');
	});

	it('escapes line-leading markers in multi-line paragraphs', () => {
		const root = el('<div>First line<br># not a heading</div>');
		expect(domToMarkdown(root)).toBe('First line\n\\# not a heading');
	});

	it('serializes headings with the right number of hashes', () => {
		expect(domToMarkdown(el('<h2>Sub title</h2>'))).toBe('## Sub title');
		expect(domToMarkdown(el('<h6>Deep</h6>'))).toBe('###### Deep');
	});

	it('serializes links and images', () => {
		expect(domToMarkdown(el('<div>See <a href="https://example.com/a b">the site</a></div>'))).toBe(
			'See [the site](https://example.com/a%20b)'
		);
		expect(domToMarkdown(el('<div><img src="./img.png" alt="a pic"></div>'))).toBe('![a pic](./img.png)');
	});

	it('serializes bullet lists with nesting', () => {
		const root = el('<ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul>');
		expect(domToMarkdown(root)).toBe('- one\n  - nested\n- two');
	});

	it('serializes ordered lists with numbering', () => {
		const root = el('<ol><li>first</li><li>second</li></ol>');
		expect(domToMarkdown(root)).toBe('1. first\n2. second');
	});

	it('serializes task list items', () => {
		const root = el('<ul><li><input type="checkbox" checked> done</li><li><input type="checkbox"> todo</li></ul>');
		expect(domToMarkdown(root)).toBe('- [x] done\n- [ ] todo');
	});

	it('serializes blockquotes with per-line prefixes', () => {
		const root = el('<blockquote>line one<br>line two</blockquote>');
		expect(domToMarkdown(root)).toBe('> line one\n> line two');
	});

	it('round-trips an inline code span containing a backtick', () => {
		const root = el('<div>Use <code>a`b</code> here</div>');
		expect(domToMarkdown(root)).toBe('Use `` a`b `` here');
	});
});
