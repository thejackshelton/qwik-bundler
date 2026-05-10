export const QWIK_HMR_FALLBACK_MS = 500;

export const QWIK_HMR_BRIDGE_SOURCE = `
if (import.meta.hot) {
	let timeout;
	import.meta.hot.on('qwik:hmr', (data) => {
		if (data.t === document.__hmrT) {
			return;
		}

		clearTimeout(timeout);
		document.__hmrT = data.t;
		document.__hmrDone = 0;
		document.dispatchEvent(new CustomEvent('qHmr', { detail: data }));
		timeout = setTimeout(() => {
			if (document.__hmrDone !== document.__hmrT) {
				location.reload();
			}
		}, ${QWIK_HMR_FALLBACK_MS});
	});
}
`;
