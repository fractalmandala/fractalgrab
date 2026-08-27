const ENDPOINT = 'http://127.0.0.1:48123';

chrome.runtime.onInstalled.addListener(() => {
	chrome.contextMenus.create({
		id: 'save-page',
		title: 'Save page to FractalGrab',
		contexts: ['page']
	});
	chrome.contextMenus.create({
		id: 'save-link',
		title: 'Save link to FractalGrab',
		contexts: ['link']
	});
	chrome.contextMenus.create({
		id: 'save-image',
		title: 'Save image to FractalGrab',
		contexts: ['image']
	});
	chrome.contextMenus.create({
		id: 'save-selection',
		title: 'Save selection to FractalGrab',
		contexts: ['selection']
	});
	chrome.contextMenus.create({
		id: 'pick-element',
		title: 'Pick an element to save…',
		contexts: ['page']
	});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === 'save-link' && info.linkUrl) {
		return save({ url: info.linkUrl, title: info.selectionText || undefined });
	}
	if (info.menuItemId === 'save-image' && info.srcUrl) {
		return save({ url: info.srcUrl, title: 'Clipped image', kind: 'image' });
	}
	if (info.menuItemId === 'save-selection' && info.selectionText) {
		return save({ text: info.selectionText, title: `Selection from ${tab?.title || 'the web'}` });
	}
	if (info.menuItemId === 'save-page') {
		return save({ url: tab?.url, title: tab?.title });
	}
	if (info.menuItemId === 'pick-element' && tab?.id != null) {
		chrome.scripting.executeScript(
			{
				target: { tabId: tab.id },
				func: () => {
					window.__fgPick?.();
				}
			},
			() => {}
		);
	}
});

// content.js asks us to save a picked element
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
	if (msg?.type === 'fg-save') {
		save(msg.payload)
			.then((ok) => sendResponse({ ok }))
			.catch(() => sendResponse({ ok: false }));
		return true;
	}
});

async function save(payload) {
	if (!payload || (!payload.url && !payload.text)) return false;
	try {
		const resp = await fetch(`${ENDPOINT}/save`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		const data = await resp.json();
		if (data?.ok) {
			flash('✓', '#10b981');
			return true;
		}
		flash('!', '#ef4444');
		return false;
	} catch {
		flash('!', '#ef4444');
		notify('FractalGrab is not running', 'Open the app (or enable the extension server in Settings) and try again.');
		return false;
	}
}

function flash(text, color) {
	chrome.action.setBadgeText({ text });
	chrome.action.setBadgeBackgroundColor({ color });
	setTimeout(() => chrome.action.setBadgeText({ text: '' }), 1800);
}

function notify(title, message) {
	try {
		chrome.notifications.create({
			type: 'basic',
			iconUrl: 'icons/128.png',
			title,
			message
		});
	} catch {
		/* notifications permission may be unavailable */
	}
}
