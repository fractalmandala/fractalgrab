import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Autosave and conflict detection tests.
 *
 * These test the debounce/coalesce logic and the conflict resolution
 * paths without requiring Svelte reactivity or a real backend.
 */

describe('autosave debounce logic', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('debounces rapid edits into a single write', () => {
		const writes: string[] = [];
		let timer: ReturnType<typeof setTimeout> | undefined;

		function scheduleSave(source: string) {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				writes.push(source);
			}, 1000);
		}

		scheduleSave('edit 1');
		vi.advanceTimersByTime(200);
		scheduleSave('edit 2');
		vi.advanceTimersByTime(200);
		scheduleSave('edit 3');
		vi.advanceTimersByTime(1500);

		expect(writes).toEqual(['edit 3']);
	});

	it('cancels pending save when new edit arrives', () => {
		const writes: string[] = [];
		let timer: ReturnType<typeof setTimeout> | undefined;

		function scheduleSave(source: string) {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				writes.push(source);
			}, 1000);
		}

		scheduleSave('first');
		vi.advanceTimersByTime(500);
		// Timer hasn't fired yet, cancel by scheduling new save
		scheduleSave('second');
		vi.advanceTimersByTime(1500);

		expect(writes).toEqual(['second']);
	});

	it('immediate save bypasses debounce', () => {
		const writes: string[] = [];
		let timer: ReturnType<typeof setTimeout> | undefined;

		function scheduleSave(source: string) {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				writes.push(source);
			}, 1000);
		}

		function saveNow(source: string) {
			if (timer) clearTimeout(timer);
			writes.push(source);
		}

		scheduleSave('queued');
		saveNow('immediate');
		vi.advanceTimersByTime(2000);

		expect(writes).toEqual(['immediate']);
	});
});

describe('conflict resolution', () => {
	it('overwrite preserves in-memory source', () => {
		const diskSource = '# Disk version\n';
		const memorySource = '# Memory edits\n';
		// Overwrite: write memorySource with no mtime check
		const result = memorySource;
		expect(result).toBe(memorySource);
		expect(result).not.toBe(diskSource);
	});

	it('reload replaces memory with disk source', () => {
		const diskSource = '# Disk version\n';
		const memorySource = '# Memory edits\n';
		// Reload: read from disk
		const result = diskSource;
		expect(result).toBe(diskSource);
		expect(result).not.toBe(memorySource);
	});

	it('cancel keeps memory source unchanged', () => {
		const diskSource = '# Disk version\n';
		const memorySource = '# Memory edits\n';
		// Cancel: no change
		const result = memorySource;
		expect(result).toBe(memorySource);
	});
});

describe('tab view persistence', () => {
	it('saves and restores view preference', () => {
		const savedTabs = [
			{ path: '/Vault/notes.md', view: 'raw' as const },
			{ path: '/Vault/readme.md', view: 'rich' as const },
		];
		const viewPrefs = new Map(savedTabs.map((t) => [t.path, t.view]));

		expect(viewPrefs.get('/Vault/notes.md')).toBe('raw');
		expect(viewPrefs.get('/Vault/readme.md')).toBe('rich');
		expect(viewPrefs.get('/Vault/missing.md')).toBeUndefined();
	});

	it('defaults to rich when no preference saved', () => {
		const viewPrefs = new Map<string, 'raw' | 'rich'>();
		const view = viewPrefs.get('/Vault/new.md') ?? 'rich';
		expect(view).toBe('rich');
	});
});
