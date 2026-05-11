import { joinURL, parsePath } from 'ufo';
import type {
	DevEnvironment,
	EnvironmentModuleNode,
	FetchableDevEnvironment,
	HtmlTagDescriptor,
	HotUpdateOptions,
	ViteDevServer,
} from 'vite';
import { QWIK_HMR_BRIDGE_SOURCE } from '../hmr/bridge';
import type { QwikEnvironment } from '../rolldown';

export const QWIK_HMR_BRIDGE_ID = 'virtual:qwik-hmr-bridge';

const RESOLVED_QWIK_HMR_BRIDGE_ID = `\0${QWIK_HMR_BRIDGE_ID}`;
const QWIK_HMR_BRIDGE_PATH = `/@id/${QWIK_HMR_BRIDGE_ID}`;

interface ViteHmrOptions {
	base: string;
	enabled: boolean;
	invalidateDevSegments?: (parent: string, environment?: QwikEnvironment) => string[];
}

const SOURCE_FILE_EXTENSION = /\.([mc]?[jt]sx?|mdx)$/;

export function createViteHmr(options: ViteHmrOptions) {
	let server: ViteDevServer | undefined;

	return {
		configureServer(nextServer: ViteDevServer) {
			server = nextServer;
			if (options.enabled) {
				installFetchHmrBridge(nextServer, options);
			}
		},
		transformIndexHtml() {
			return options.enabled ? hmrBridgeTags(options.base) : undefined;
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
		hotUpdate(environment: DevEnvironment | undefined, ctx: HotUpdateOptions) {
			if (environment?.name !== 'client' && environment?.name !== 'ssr') {
				return undefined;
			}

			const env = environment.name === 'ssr' ? 'server' : 'client';
			const hot = env === 'server' ? server?.environments?.client?.hot : environment.hot;
			if (!hot?.send) {
				return undefined;
			}

			if (!options.enabled) {
				hot.send({ type: 'full-reload' });
				return [];
			}

			const files = changedFiles(ctx.modules ?? []);
			if (!files.size) {
				return undefined;
			}

			const invalidated = new Set<EnvironmentModuleNode>();
			for (const file of files) {
				for (const id of options.invalidateDevSegments?.(file, env) ?? []) {
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

function installFetchHmrBridge(server: ViteDevServer, options: ViteHmrOptions) {
	// Some SSR adapters, including Nitro, render final HTML in fetchable Vite
	// environments instead of Vite's transformIndexHtml hook. Wrap those Response
	// objects so Node, workerd, and other Fetch-based runtimes share the same path.
	for (const environment of Object.values(server.environments)) {
		const fetchEnv = environment as Partial<Pick<FetchableDevEnvironment, 'dispatchFetch'>>;
		if (!fetchEnv.dispatchFetch) continue;

		const dispatchFetch = fetchEnv.dispatchFetch.bind(fetchEnv);
		fetchEnv.dispatchFetch = async (request) => {
			const response = await dispatchFetch(request);
			if (!response.headers.get('content-type')?.includes('text/html')) return response;

			const html = await response.text();
			const nextHtml = injectHmrBridge(html, options.base);
			const headers = new Headers(response.headers);
			if (nextHtml !== html) headers.delete('content-length');
			return new Response(nextHtml, {
				headers,
				status: response.status,
				statusText: response.statusText,
			});
		};
	}
}

function hmrBridgeTags(base: string): HtmlTagDescriptor[] {
	return [
		{
			tag: 'script',
			children: 'globalThis.qInspector ??= true;',
			injectTo: 'head',
		},
		{
			tag: 'script',
			attrs: { type: 'module', src: hmrBridgePath(base) },
			injectTo: 'head',
		},
	];
}

function injectHmrBridge(html: string, base: string) {
	if (!html || html.includes(QWIK_HMR_BRIDGE_ID)) return html;

	const tags = hmrBridgeHtml(base);
	if (html.includes('</head>')) return html.replace('</head>', `${tags}</head>`);
	if (html.includes('<head>')) return html.replace('<head>', `<head>${tags}`);
	return html;
}

function hmrBridgeHtml(base: string) {
	return (
		'<script>globalThis.qInspector ??= true;</script>' +
		`<script type="module" src="${hmrBridgePath(base)}"></script>`
	);
}

function hmrBridgePath(base: string) {
	return joinURL(base, QWIK_HMR_BRIDGE_PATH);
}

function changedFiles(modules: EnvironmentModuleNode[]) {
	const files = new Set<string>();
	for (const module of modules) {
		for (const item of [module, ...(module.importers ?? [])]) {
			const url = sourceUrl(item);
			if (url) files.add(url);
		}
	}

	return files;
}

function sourceUrl(module: EnvironmentModuleNode) {
	const url = parsePath(module.url).pathname;
	return module.type === 'js' && SOURCE_FILE_EXTENSION.test(url) ? url : null;
}
