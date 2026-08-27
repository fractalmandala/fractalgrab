const ENDPOINT = 'http://127.0.0.1:48123';

async function checkStatus() {
	try {
		const resp = await fetch(`${ENDPOINT}/ping`, { cache: 'no-store' });
		const data = await resp.json();
		if (data?.ok) {
			document.getElementById('dot').classList.add('ok');
			document.getElementById('status').textContent = 'FractalGrab is running';
		} else {
			document.getElementById('status').textContent = 'App not responding';
		}
	} catch {
		document.getElementById('status').textContent = 'App is not running';
	}
}

function save(payload) {
	return fetch(`${ENDPOINT}/save`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	}).then((r) => r.json());
}

document.getElementById('page').addEventListener('click', async () => {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (!tab?.url) return;
	const res = await save({ url: tab.url, title: tab.title });
	document.getElementById('status').textContent = res?.ok ? 'Saved ✓' : 'Save failed';
	if (res?.ok) setTimeout(() => window.close(), 600);
});

document.getElementById('pick').addEventListener('click', async () => {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (tab?.id != null) {
		await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__fgPick?.() });
		window.close();
	}
});

checkStatus();
