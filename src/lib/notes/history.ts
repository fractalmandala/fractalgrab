// Snapshot-based undo/redo history. The notes store pushes the full document
// source before each edit batch; because both Raw and Rich views edit the same
// `source`, one history serves both views.

export class History<T> {
	private items: T[] = [];
	private index = -1;
	private readonly limit: number;

	constructor(limit = 100) {
		this.limit = limit;
	}

	get canUndo(): boolean {
		return this.index > 0;
	}

	get canRedo(): boolean {
		return this.index < this.items.length - 1;
	}

	/** Push a snapshot, discarding any redo trail. */
	push(item: T): void {
		this.items.length = this.index + 1;
		this.items.push(item);
		if (this.items.length > this.limit) {
			this.items.shift();
		}
		this.index = this.items.length - 1;
	}

	undo(): T | null {
		if (!this.canUndo) return null;
		this.index -= 1;
		return this.items[this.index];
	}

	redo(): T | null {
		if (!this.canRedo) return null;
		this.index += 1;
		return this.items[this.index];
	}

	reset(item: T): void {
		this.items = [item];
		this.index = 0;
	}
}
