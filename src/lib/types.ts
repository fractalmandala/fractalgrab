export type ItemType = 'link' | 'image' | 'video' | 'note' | 'file';

export interface Item {
	id: string;
	type: ItemType;
	title: string;
	filename: string;
	url?: string | null;
	createdAt: number;
	updatedAt: number;
	favourite: boolean;
	collectionIds: string[];
	tags: string[];
	note?: string | null;
	colors: string[];
	ocrText?: string | null;
	aiTags?: string[];
	faviconFile?: string | null;
	imageFile?: string | null;
	width?: number | null;
	height?: number | null;
}

export interface Collection {
	id: string;
	name: string;
	parentId?: string | null;
	icon?: string | null;
	createdAt: number;
}

export type ViewMode = 'moodboard' | 'cards' | 'list' | 'canvas' | 'timeline' | 'notes';

export interface Vault {
	id: string;
	path: string;
	name: string;
	exists: boolean;
}

export interface VaultNode {
	name: string;
	dirs: VaultNode[];
	files: string[];
}

export interface VaultItem {
	path: string;
	name: string;
	isDir: boolean;
}

export interface NoteTab {
	id: string;
	path: string;
	name: string;
	inVault: boolean;
	source: string;
	savedSource: string;
	mtimeMs: number;
	dirty: boolean;
	conflict: boolean;
	missing: boolean;
	readError?: string | null;
	view: 'raw' | 'rich';
}

export interface CutState {
	path: string;
	isDir: boolean;
}

export interface OpenTabEntry {
	path: string;
	view: 'raw' | 'rich';
}

export interface NotesSettings {
	activeVaultId: string | null;
	openPaths: string[];
	/** Per-tab view preferences. Optional for backwards compat with older manifests. */
	openTabs?: OpenTabEntry[];
}

export interface BackupSettings {
	enabled: boolean;
	intervalHours: number;
}

export interface AIProvider {
	id: string;
	name: string;
	baseUrl: string;
	key: string;
	models: string[];
}

export interface AISettings {
	providers: AIProvider[];
	activeProviderId: string;
	activeModel: string;
	autoTag: boolean;
	autoRename: boolean;
}

export interface Settings {
	libraryPath: string;
	extensionServer: boolean;
	view: ViewMode;
	backup: BackupSettings;
	ai: AISettings;
	notes: NotesSettings;
	sidebarWidth?: number;
}

export interface Manifest {
	version: number;
	settings: Settings;
	collections: Collection[];
	items: Item[];
	canvas?: CanvasLayout;
}

export interface FileMeta {
	name: string;
	size: number;
	mtime: number;
}

export interface BackupMeta {
	lastBackupAt?: number;
	lastBackupPath?: string;
}

export interface CanvasLayout {
	[itemId: string]: { x: number; y: number; w: number; h: number };
}
