import { backend, blobToDataUrl } from './backend';
import type { AIProvider, AISettings, Item } from './types';

export function newProvider(name: string): AIProvider {
	return {
		id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
		name: name || 'Provider',
		baseUrl: '',
		key: '',
		models: ['gpt-4o-mini']
	};
}

/** Normalise any stored AI settings shape into the providers form. */
export function migrateAi(raw: Partial<AISettings> & Record<string, unknown> | undefined | null): AISettings {
	const fallback: AISettings = {
		providers: [newProvider('OpenAI')],
		activeProviderId: '',
		activeModel: '',
		autoTag: false,
		autoRename: false
	};
	fallback.providers[0].baseUrl = 'https://api.openai.com/v1';
	fallback.providers[0].models = ['gpt-4o-mini', 'gpt-4o'];
	fallback.activeProviderId = fallback.providers[0].id;
	fallback.activeModel = 'gpt-4o-mini';
	if (!raw) return fallback;

	const out: AISettings = {
		providers: Array.isArray(raw.providers) && raw.providers.length
			? (raw.providers as AIProvider[]).map((p) => ({
					id: p.id || `p-${Math.random().toString(36).slice(2, 8)}`,
					name: p.name || 'Provider',
					baseUrl: p.baseUrl || '',
					key: p.key || '',
					models: Array.isArray(p.models) && p.models.length ? p.models.map(String) : ['gpt-4o-mini']
				}))
			: [],
		activeProviderId: typeof raw.activeProviderId === 'string' ? raw.activeProviderId : '',
		activeModel: typeof raw.activeModel === 'string' ? raw.activeModel : '',
		autoTag: Boolean(raw.autoTag),
		autoRename: Boolean(raw.autoRename)
	};

	// Migrate the old single-provider shape { baseUrl, key, model }.
	if (!out.providers.length) {
		const legacyBase = typeof raw.baseUrl === 'string' && raw.baseUrl ? raw.baseUrl : 'https://api.openai.com/v1';
		const legacyKey = typeof raw.key === 'string' ? raw.key : '';
		const legacyModel = typeof raw.model === 'string' && raw.model ? raw.model : 'gpt-4o-mini';
		out.providers = [
			{
				id: 'p1',
				name: 'OpenAI',
				baseUrl: legacyBase,
				key: legacyKey,
				models: [legacyModel]
			}
		];
		out.activeProviderId = 'p1';
		out.activeModel = legacyModel;
	}
	if (!out.activeProviderId && out.providers.length) out.activeProviderId = out.providers[0].id;
	if (!out.activeModel) {
		const active = out.providers.find((p) => p.id === out.activeProviderId) ?? out.providers[0];
		out.activeModel = active?.models[0] ?? 'gpt-4o-mini';
	}
	return out;
}

export function activeProvider(settings: AISettings): AIProvider | null {
	return settings.providers.find((p) => p.id === settings.activeProviderId) ?? settings.providers[0] ?? null;
}

export function aiConfigured(settings: AISettings): boolean {
	const p = activeProvider(settings);
	return Boolean(p && p.baseUrl && p.key && settings.activeModel);
}

interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string | unknown[];
}

async function chat(
	provider: AIProvider,
	model: string,
	messages: ChatMessage[],
	opts: { json?: boolean; maxTokens?: number } = {}
): Promise<string> {
	const base = provider.baseUrl.replace(/\/+$/, '');
	const resp = await fetch(`${base}/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${provider.key}`
		},
		body: JSON.stringify({
			model,
			messages,
			temperature: 0.4,
			max_tokens: opts.maxTokens ?? 700,
			...(opts.json ? { response_format: { type: 'json_object' } } : {})
		})
	});
	if (!resp.ok) {
		const detail = await resp.text().catch(() => '');
		throw new Error(`AI request failed (${resp.status}) ${detail.slice(0, 200)}`);
	}
	const data = await resp.json();
	const content: string = data.choices?.[0]?.message?.content ?? '';
	return content;
}

export function itemContext(item: Item): string {
	const parts = [
		item.title,
		item.url ? `(${item.url})` : '',
		item.note ? `— note: ${item.note}` : '',
		item.tags?.length ? `— tags: ${item.tags.join(', ')}` : '',
		item.ocrText ? `— text inside: ${item.ocrText.slice(0, 300)}` : ''
	];
	return parts.filter(Boolean).join(' ');
}

export async function aiTagItem(item: Item, settings: AISettings): Promise<string[]> {
	const p = activeProvider(settings);
	if (!p) return [];
	const out = await chat(
		p,
		settings.activeModel,
		[
			{
				role: 'system',
				content:
					'You tag saved web content with short, useful, lowercase tags. Reply with ONLY a JSON object: {"tags":["tag1","tag2"]} — 3 to 6 tags.'
			},
			{ role: 'user', content: itemContext(item) }
		],
		{ json: true }
	);
	try {
		const parsed = JSON.parse(out) as { tags?: unknown };
		return Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 8) : [];
	} catch {
		return [];
	}
}

export async function aiRename(item: Item, settings: AISettings): Promise<string> {
	const p = activeProvider(settings);
	if (!p) return item.title;
	const out = await chat(p, settings.activeModel, [
		{
			role: 'system',
			content:
				'You rename saved files with clear, human, concise names. Reply with ONLY the name — no extension, no quotes, no explanation, max 60 characters.'
		},
		{ role: 'user', content: `Current name: "${item.title}"${item.url ? `\nURL: ${item.url}` : ''}\nNew name:` }
	]);
	const clean = out
		.replace(/["'\n]/g, '')
		.trim()
		.slice(0, 60);
	return clean || item.title;
}

export async function aiArtPrompt(item: Item, settings: AISettings): Promise<string> {
	const p = activeProvider(settings);
	if (!p) throw new Error('No AI provider configured');
	let imageDataUrl = '';
	try {
		const url = backend.fileUrl(item.filename);
		const resp = await fetch(url);
		if (resp.ok) {
			const blob = await resp.blob();
			imageDataUrl = await blobToDataUrl(blob);
		}
	} catch {
		/* offline */
	}
	if (!imageDataUrl) throw new Error('Could not load the image for prompting');
	const out = await chat(p, settings.activeModel, [
		{
			role: 'system',
			content:
				'Reverse-engineer the attached image into a detailed art prompt for an image generator: subject, composition, lighting, palette, mood, lens and style. Reply with the prompt text only, 1–3 sentences.'
		},
		{
			role: 'user',
			content: [
				{ type: 'text', text: 'Write the art prompt:' },
				{ type: 'image_url', image_url: { url: imageDataUrl } }
			]
		}
	]);
	return out.trim();
}

export async function aiSemanticSearch(
	query: string,
	items: Item[],
	settings: AISettings
): Promise<string[]> {
	const p = activeProvider(settings);
	if (!p) return [];
	const list = items
		.slice(0, 60)
		.map((i) => `${i.id} :: ${itemContext(i)}`)
		.join('\n');
	const out = await chat(
		p,
		settings.activeModel,
		[
			{
				role: 'system',
				content:
					'You rank saved items by relevance to a query. Reply with ONLY a JSON object: {"ids":["id1","id2"]} — matching ids, most relevant first, max 12.'
			},
			{ role: 'user', content: `Query: "${query}"\n\nItems:\n${list}` }
		],
		{ json: true }
	);
	try {
		const parsed = JSON.parse(out) as { ids?: unknown };
		return Array.isArray(parsed.ids) ? parsed.ids.map(String) : [];
	} catch {
		return [];
	}
}
