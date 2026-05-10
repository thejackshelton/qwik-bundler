import { QWIK_HMR_BRIDGE_SOURCE } from '../client/hmr-bridge';

export const QWIK_HMR_BRIDGE_ID = 'virtual:qwik-hmr-bridge';

const RESOLVED_QWIK_HMR_BRIDGE_ID = `\0${QWIK_HMR_BRIDGE_ID}`;
const QWIK_HMR_BRIDGE_PATH = `/@id/${QWIK_HMR_BRIDGE_ID}`;

interface ViteHmrOptions {
	enabled: () => boolean;
}

export function createViteHmr(options: ViteHmrOptions) {
	return {
		transformIndexHtml() {
			if (!options.enabled()) {
				return undefined;
			}

			return [{ tag: 'script', attrs: { type: 'module', src: QWIK_HMR_BRIDGE_PATH } }];
		},
		resolveId(id: string) {
			if (id !== QWIK_HMR_BRIDGE_ID) {
				return null;
			}

			return { id: RESOLVED_QWIK_HMR_BRIDGE_ID, moduleSideEffects: true };
		},
		load(id: string) {
			return id === RESOLVED_QWIK_HMR_BRIDGE_ID ? QWIK_HMR_BRIDGE_SOURCE : null;
		},
	};
}
