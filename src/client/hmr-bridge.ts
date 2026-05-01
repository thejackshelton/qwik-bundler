/// <reference lib="dom" />
/// <reference types="vite/client" />

interface HmrPayload {
	files: string[];
	t: number;
}

declare global {
	interface Document {
		__hmrDone?: number;
		__hmrT?: number;
	}
}

export const hmrBridgeCode = `(${hmrBridge.toString()})();\n`;

function hmrBridge() {
	if (!import.meta.hot) {
		return;
	}

	let timeout: ReturnType<typeof setTimeout> | undefined;
	import.meta.hot.on('qwik:hmr', (data: HmrPayload) => {
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
		}, 500);
	});
}
