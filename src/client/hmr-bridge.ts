export const QWIK_HMR_FALLBACK_MS = 500;

export const QWIK_HMR_BRIDGE_SOURCE = `
globalThis.qInspector ??= true;

if (import.meta.hot) {
	let timeout;
	import.meta.hot.on('qwik:hmr', (data) => {
		if (data.t === document.__hmrT) {
			return;
		}

		clearTimeout(timeout);
		document.__hmrT = data.t;
		document.__hmrDone = 0;
		for (const host of document.querySelectorAll('[q-d\\\\:q-hmr]')) {
			host.dataset.qwikInspector ??= data.files?.[0] || '';
		}
		document.dispatchEvent(new CustomEvent('qHmr', { detail: data }));
		timeout = setTimeout(() => {
			if (document.__hmrDone !== document.__hmrT) {
				location.reload();
			}
		}, ${QWIK_HMR_FALLBACK_MS});
	});
}
`;
