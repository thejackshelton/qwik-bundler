import { joinURL, parsePath } from 'ufo';
import type { EnvironmentModuleNode } from 'vite';
import { QWIK_HMR_BRIDGE_SOURCE } from '../client/hmr-bridge';
import type { QwikEnvironment } from '../rolldown';

export const QWIK_HMR_BRIDGE_ID = 'virtual:qwik-hmr-bridge';

const RESOLVED_QWIK_HMR_BRIDGE_ID = `\0${QWIK_HMR_BRIDGE_ID}`;
const QWIK_HMR_BRIDGE_PATH = `/@id/${QWIK_HMR_BRIDGE_ID}`;

interface ViteHmrOptions {
	base: () => string;
	enabled: () => boolean;
	invalidateDevSegments?: (parent: string, environment?: QwikEnvironment) => string[];
}

type ViteHotUpdateEnvironment = {
	name?: string;
	moduleGraph?: {
		getModuleById?: (id: string) => EnvironmentModuleNode | undefined;
		invalidateModule?: (
			module: EnvironmentModuleNode,
			invalidated?: Set<EnvironmentModuleNode>,
			timestamp?: number,
			isHmr?: boolean,
		) => void;
	};
	hot?: {
		send?: (payload: unknown) => void;
	};
};

type ViteDevServer = {
	environments?: {
		client?: {
			hot?: {
				send?: (payload: unknown) => void;
			};
		};
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
	let server: ViteDevServer | undefined;

	return {
		configureServer(nextServer: ViteDevServer) {
			server = nextServer;
		},
		transformIndexHtml() {
			if (!options.enabled()) {
				return undefined;
			}

			return [
				{
					tag: 'script',
					attrs: { type: 'module', src: joinURL(options.base(), QWIK_HMR_BRIDGE_PATH) },
				},
			];
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
			if (environment?.name !== 'client' && environment?.name !== 'ssr') {
				return undefined;
			}

			const hot =
				environment.name === 'ssr' ? server?.environments?.client?.hot : environment.hot;
			if (!options.enabled()) {
				hot?.send?.({ type: 'full-reload' });
				return [];
			}

			const files = sourceFiles(ctx.modules ?? []);
			if (!files.size) {
				return undefined;
			}

			const invalidated = new Set<EnvironmentModuleNode>();
			for (const file of files) {
				const segmentIds =
					options.invalidateDevSegments?.(file, hmrEnvironment(environment)) ?? [];
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

			hot?.send?.({
				type: 'custom',
				event: 'qwik:hmr',
				data: { files: [...files], t: ctx.timestamp },
			});

			return [];
		},
	};
}

function hmrEnvironment(environment: ViteHotUpdateEnvironment): QwikEnvironment {
	return environment.name === 'ssr' ? 'server' : 'client';
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
