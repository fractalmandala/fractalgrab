import type { Manifest } from './types';

export function defaultManifest(): Manifest {
	return {
		version: 1,
		settings: {
			libraryPath: '~/Downloads/fractalgrab',
			extensionServer: false,
			view: 'moodboard',
			backup: { enabled: true, intervalHours: 6 },
			ai: {
				providers: [
					{
						id: 'p1',
						name: 'OpenAI',
						baseUrl: 'https://api.openai.com/v1',
						key: '',
						models: ['gpt-4o-mini', 'gpt-4o']
					}
				],
				activeProviderId: 'p1',
				activeModel: 'gpt-4o-mini',
				autoTag: false,
				autoRename: false
			},
			notes: { activeVaultId: null, openPaths: [] }
		},
		collections: [],
		items: []
	};
}

function now(offsetDays: number, hour: number) {
	const d = new Date();
	d.setDate(d.getDate() - offsetDays);
	d.setHours(hour, Math.floor(Math.random() * 59), 0, 0);
	return d.getTime();
}

export function seedManifest(): Manifest {
	const m = defaultManifest();
	m.collections = [
		{ id: 'c1', name: 'Design', icon: 'palette', createdAt: now(30, 9) },
		{ id: 'c2', name: 'Typography', parentId: 'c1', icon: 'type', createdAt: now(28, 10) },
		{ id: 'c3', name: 'Frontend', icon: 'code', createdAt: now(25, 11) },
		{ id: 'c4', name: 'Reading', icon: 'book-open', createdAt: now(20, 12) },
		{ id: 'c5', name: 'Recipes', icon: 'chef-hat', createdAt: now(18, 13) },
		{ id: 'c6', name: 'Wallpapers', icon: 'image', createdAt: now(12, 14) }
	];

	const img = (seed: string, w = 800, h = 600) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

	m.items = [
		{
			id: 'i1', type: 'link', title: 'A List Apart — Designing for the Unexpected', filename: 'a-list-apart.webloc',
			url: 'https://alistapart.com', createdAt: now(14, 9), updatedAt: now(14, 9), favourite: true,
			collectionIds: ['c1', 'c3'], tags: ['design', 'web'], colors: ['#c2410c', '#fdba74'],
			aiTags: ['article', 'ux']
		},
		{
			id: 'i2', type: 'image', title: 'Fractal bloom', filename: 'fractal-bloom.jpg',
			createdAt: now(12, 15), updatedAt: now(12, 15), favourite: true,
			collectionIds: ['c6'], tags: ['fractal', 'wallpaper'], colors: ['#7c3aed', '#c4b5fd']
		},
		{
			id: 'i3', type: 'link', title: 'Mozilla Developer Network', filename: 'mdn.webloc',
			url: 'https://developer.mozilla.org', createdAt: now(10, 8), updatedAt: now(9, 10), favourite: false,
			collectionIds: ['c3'], tags: ['docs', 'javascript'], colors: ['#0369a1']
		},
		{
			id: 'i4', type: 'note', title: 'Reading list idea', filename: 'reading-list.md',
			createdAt: now(8, 20), updatedAt: now(8, 20), favourite: false, collectionIds: ['c4'],
			tags: ['books'], colors: ['#65a30d'], note: 'The Shape of Design, How to Do Great Work, Why Information Grows'
		},
		{
			id: 'i5', type: 'image', title: 'Moody harbour at dusk', filename: 'harbour-dusk.jpg',
			createdAt: now(7, 18), updatedAt: now(7, 18), favourite: false,
			collectionIds: ['c1', 'c6'], tags: ['photography', 'moody'], colors: ['#1e3a8a', '#0f172a', '#7dd3fc']
		},
		{
			id: 'i6', type: 'link', title: 'Why Svelte 5 runes feel good', filename: 'svelte-runes.webloc',
			url: 'https://svelte.dev/blog/runes', createdAt: now(5, 10), updatedAt: now(5, 10), favourite: true,
			collectionIds: ['c3'], tags: ['svelte', 'javascript'], colors: ['#ff3e00']
		},
		{
			id: 'i7', type: 'link', title: 'Sourdough for beginners', filename: 'sourdough.webloc',
			url: 'https://www.kingarthurbaking.com/recipes/sourdough-starter', createdAt: now(4, 7), updatedAt: now(4, 7),
			favourite: false, collectionIds: ['c5'], tags: ['baking', 'bread'], colors: ['#b45309', '#fcd9a8']
		},
		{
			id: 'i8', type: 'image', title: 'Type specimen — Grotesk', filename: 'grotesk-specimen.jpg',
			createdAt: now(3, 16), updatedAt: now(3, 16), favourite: false,
			collectionIds: ['c2'], tags: ['type', 'specimen'], colors: ['#111827', '#f9fafb']
		},
		{
			id: 'i9', type: 'link', title: 'Grid systems in web design', filename: 'grid-systems.webloc',
			url: 'https://www.thegridsystem.org', createdAt: now(2, 11), updatedAt: now(2, 11), favourite: false,
			collectionIds: ['c1', 'c3'], tags: ['layout', 'design'], colors: ['#4f46e5']
		},
		{
			id: 'i10', type: 'note', title: 'AI art prompt ideas', filename: 'art-prompts.md',
			createdAt: now(1, 22), updatedAt: now(1, 22), favourite: true, collectionIds: ['c1'],
			tags: ['ai', 'art'], colors: ['#db2777'],
			note: 'soft volumetric light, macro photography of a crystal, deep teal palette, gentle bokeh'
		},
		{
			id: 'i11', type: 'link', title: 'Refactoring UI', filename: 'refactoring-ui.webloc',
			url: 'https://www.refactoringui.com', createdAt: now(0, 9), updatedAt: now(0, 9), favourite: false,
			collectionIds: ['c1'], tags: ['design', 'ui'], colors: ['#059669']
		}
	];

	// The seed images: map filenames to picsum URLs for the preview.
	for (const item of m.items) {
		if (item.type === 'image') {
			(item as any).__seed = img(item.id, 900, 640);
		}
	}

	return m;
}

export function isSeeded(): boolean {
	return (localStorage.getItem('fractalgrab:manifest') ?? '').length === 0;
}

export function writeSeedToStorage() {
	const seeded = seedManifest();
	seeded.settings.extensionServer = false;
	localStorage.setItem('fractalgrab:manifest', JSON.stringify(seeded));
	(seeded.items.filter((i) => i.type === 'image') as any[]).forEach((i) => {
		// store the seed URL so fileUrl resolves in preview mode
		localStorage.setItem(`fractalgrab:seed:${i.filename}`, i.__seed);
	});
}
