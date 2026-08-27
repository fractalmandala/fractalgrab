import { describe, expect, it } from 'vitest';
import { History } from './history';

describe('History', () => {
	it('undoes and redoes snapshots in order', () => {
		const h = new History<string>();
		h.reset('a');
		h.push('b');
		h.push('c');
		expect(h.undo()).toBe('b');
		expect(h.undo()).toBe('a');
		expect(h.undo()).toBeNull();
		expect(h.redo()).toBe('b');
		expect(h.redo()).toBe('c');
		expect(h.redo()).toBeNull();
	});

	it('discards the redo trail when a new snapshot is pushed', () => {
		const h = new History<string>();
		h.reset('a');
		h.push('b');
		h.push('c');
		h.undo();
		h.push('d');
		expect(h.redo()).toBeNull();
		expect(h.undo()).toBe('b');
		expect(h.undo()).toBe('a');
		expect(h.undo()).toBeNull();
	});

	it('is shared-agnostic to view toggles (pure snapshot semantics)', () => {
		const h = new History<string>();
		h.reset('v1');
		h.push('v2');
		// A toggle must not push anything — nothing pushed here.
		expect(h.undo()).toBe('v1');
		// After undoing, redo restores the latest snapshot.
		expect(h.redo()).toBe('v2');
	});

	it('caps the stack at the limit', () => {
		const h = new History<number>(3);
		h.reset(0);
		h.push(1);
		h.push(2);
		h.push(3);
		h.push(4);
		// Only the last 3 snapshots are retained.
		expect(h.undo()).toBe(3);
		expect(h.undo()).toBe(2);
		expect(h.undo()).toBeNull();
	});

	it('exposes canUndo/canRedo', () => {
		const h = new History<string>();
		expect(h.canUndo).toBe(false);
		expect(h.canRedo).toBe(false);
		h.reset('a');
		h.push('b');
		expect(h.canUndo).toBe(true);
		h.undo();
		expect(h.canRedo).toBe(true);
	});
});
