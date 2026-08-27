// Element picker: highlight on hover, click to save.
(() => {
	if (window.__fgPick) return;

	let overlay = null;
	let current = null;
	let active = false;

	function cleanup() {
		active = false;
		current = null;
		overlay?.remove();
		overlay = null;
		document.removeEventListener('mouseover', onHover, true);
		document.removeEventListener('click', onClick, true);
		document.removeEventListener('keydown', onKey, true);
	}

	function describe(el) {
		const a = el.closest('a');
		const img = el.closest('img');
		if (a && a.href) {
			return { url: a.href, title: a.textContent?.trim().slice(0, 120) || a.title || undefined };
		}
		if (img && img.src) {
			return { url: img.src, title: img.alt?.trim() || 'Clipped image', kind: 'image' };
		}
		const text = (el.innerText || el.textContent || '').trim();
		if (text) {
			return { text: text.slice(0, 5000), title: `Clipped from ${location.hostname}` };
		}
		return { text: location.href, title: location.hostname };
	}

	function onHover(e) {
		if (!active) return;
		current = e.target;
		const rect = current.getBoundingClientRect();
		overlay.style.left = rect.left + 'px';
		overlay.style.top = rect.top + 'px';
		overlay.style.width = rect.width + 'px';
		overlay.style.height = rect.height + 'px';
	}

	function onClick(e) {
		if (!active) return;
		e.preventDefault();
		e.stopPropagation();
		const payload = describe(e.target);
		cleanup();
		chrome.runtime.sendMessage({ type: 'fg-save', payload });
	}

	function onKey(e) {
		if (e.key === 'Escape') cleanup();
	}

	window.__fgPick = () => {
		if (active) return;
		active = true;
		overlay = document.createElement('div');
		Object.assign(overlay.style, {
			position: 'fixed',
			zIndex: '2147483647',
			pointerEvents: 'none',
			boxShadow: '0 0 0 2px #f97316, 0 0 0 9999px rgba(0,0,0,0.25)',
			borderRadius: '4px',
			transition: 'all 80ms ease'
		});
		document.body.appendChild(overlay);
		document.addEventListener('mouseover', onHover, true);
		document.addEventListener('click', onClick, true);
		document.addEventListener('keydown', onKey, true);
	};
})();
