import { parsePath } from 'ufo';
import type { EnvironmentModuleNode } from 'vite';
import { QWIK_HMR_BRIDGE_SOURCE } from '../client/hmr-bridge';
import type { QwikEnvironment } from '../rolldown';
import { installHtmlBridge } from './html-bridge';

export const QWIK_HMR_BRIDGE_ID = 'virtual:qwik-hmr-bridge';

const RESOLVED_QWIK_HMR_BRIDGE_ID = `\0${QWIK_HMR_BRIDGE_ID}`;
interface ViteHmrOptions {
	base: () => string;
	enabled: () => boolean;
	invalidateDevSegments?: (parent: string, environment?: QwikEnvironment) => string[];
}

type HotEnv = {
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
	middlewares?: Parameters<typeof installHtmlBridge>[0]['middlewares'];
};

type HotModule = {
	type?: string;
	url?: string;
	importers?: Iterable<HotModule>;
};

type HotCtx = {
	modules?: HotModule[];
	timestamp: number;
};

const SOURCE_FILE_EXTENSION = /\.([mc]?[jt]sx?|mdx)$/;

export function createViteHmr(options: ViteHmrOptions) {
	let server: ViteDevServer | undefined;

	return {
		configureServer(nextServer: ViteDevServer) {
			server = nextServer;
			if (options.enabled()) {
				installHtmlBridge(nextServer, options.base);
			}
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
		hotUpdate(environment: HotEnv | undefined, ctx: HotCtx) {
			if (environment?.name !== 'client' && environment?.name !== 'ssr') {
				return undefined;
			}

			const hot =
				environment.name === 'ssr' ? server?.environments?.client?.hot : environment.hot;
			if (!hot?.send) {
				return undefined;
			}

			if (!options.enabled()) {
				hot.send({ type: 'full-reload' });
				return [];
			}

			const files = changedFiles(ctx.modules ?? []);
			if (!files.size) {
				return undefined;
			}

			const invalidated = new Set<EnvironmentModuleNode>();
			for (const file of files) {
				const segmentIds =
					options.invalidateDevSegments?.(file, envName(environment)) ?? [];
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

			hot.send({
				type: 'custom',
				event: 'qwik:hmr',
				data: { files: [...files], t: ctx.timestamp },
			});

			return [];
		},
	};
}

function envName(environment: HotEnv): QwikEnvironment {
	return environment.name === 'ssr' ? 'server' : 'client';
}

function changedFiles(modules: HotModule[]) {
	const files = new Set<string>();
	for (const module of modules) {
		const url = sourceUrl(module);
		if (url) {
			files.add(url);
			continue;
		}

		for (const importer of module.importers ?? []) {
			const importerUrl = sourceUrl(importer);
			if (importerUrl) {
				files.add(importerUrl);
			}
		}
	}

	return files;
}

function sourceUrl(module: HotModule) {
	const url = module.url ? parsePath(module.url).pathname : null;
	return module.type === 'js' && url && SOURCE_FILE_EXTENSION.test(url) ? url : null;
}
