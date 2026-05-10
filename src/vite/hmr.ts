import { parsePath } from 'ufo';
import { QWIK_HMR_BRIDGE_SOURCE } from '../client/hmr-bridge';
import type { QwikEnvironment } from '../rolldown';

export const QWIK_HMR_BRIDGE_ID = 'virtual:qwik-hmr-bridge';

const RESOLVED_QWIK_HMR_BRIDGE_ID = `\0${QWIK_HMR_BRIDGE_ID}`;
const QWIK_HMR_BRIDGE_PATH = `/@id/${QWIK_HMR_BRIDGE_ID}`;

interface ViteHmrOptions {
	enabled: () => boolean;
	invalidateDevSegments?: (parent: string, environment?: QwikEnvironment) => string[];
}

type ViteHotUpdateEnvironment = {
	name?: string;
	moduleGraph?: {
		getModuleById?: (id: string) => unknown;
		invalidateModule?: (
			module: unknown,
			invalidated?: Set<unknown>,
			timestamp?: number,
			isHmr?: boolean,
		) => void;
	};
	hot?: {
		send?: (payload: unknown) => void;
	};
};

type ViteHotUpdateModule = {
	type?: string;
	url?: string;
	importers?: Iterable<ViteHotUpdateModule>;
};

type ViteHotUpdateContext = {
	modules?: ViteHotUpdateModule[];
	timestamp: number;
};

const SOURCE_FILE_EXTENSION = /\.([mc]?[jt]sx?|mdx)$/;

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
		hotUpdate(environment: ViteHotUpdateEnvironment | undefined, ctx: ViteHotUpdateContext) {
			if (environment?.name !== 'client') {
				return undefined;
			}

			const files = sourceFiles(ctx.modules ?? []);
			if (!files.size) {
				return undefined;
			}

			const invalidated = new Set<unknown>();
			for (const file of files) {
				const segmentIds = options.invalidateDevSegments?.(file, 'client') ?? [];
				for (const id of segmentIds) {
					const module = environment.moduleGraph?.getModuleById?.(id);
					if (!module) continue;

					environment.moduleGraph?.invalidateModule?.(
						module,
						invalidated,
						ctx.timestamp,
						true,
					);
				}
			}

			if (options.enabled()) {
				environment.hot?.send?.({
					type: 'custom',
					event: 'qwik:hmr',
					data: { files: [...files], t: ctx.timestamp },
				});
			}

			return [];
		},
	};
}

function sourceFiles(modules: ViteHotUpdateModule[]) {
	const files = new Set<string>();
	for (const module of modules) {
		const url = cleanUrl(module.url);
		if (module.type === 'js' && url && isSourceFile(url)) {
			files.add(url);
			continue;
		}

		for (const importer of module.importers ?? []) {
			const importerUrl = cleanUrl(importer.url);
			if (importer.type === 'js' && importerUrl && isSourceFile(importerUrl)) {
				files.add(importerUrl);
			}
		}
	}

	return files;
}

function cleanUrl(url: string | undefined) {
	return url ? parsePath(url).pathname : null;
}

function isSourceFile(url: string) {
	return SOURCE_FILE_EXTENSION.test(url);
}
