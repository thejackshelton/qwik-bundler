import { basename, dirname, extname, join, relative, resolve } from 'pathe';
import type {
	ConfigEnv,
	EnvironmentOptions,
	Plugin,
	PluginOption,
	UserConfig,
	ViteDevServer,
} from 'vite';
import type { BundleGraphAdder, QwikManifest } from '../../src/types.ts';
import { configureRouterPreviewServer, type RouterPreviewOptions } from './preview.ts';
import {
	QWIK_ROUTER_SERVER_FUNCTIONS_ID,
	serverFunctionsPlugin,
	type CollectServerFunctionModuleOptions,
	type ServerFunctionPluginContext,
	type ServerFunctionsPluginOptions,
	collectServerFunctionModuleIds,
} from './server-functions.ts';

export {
	QWIK_ROUTER_SERVER_FUNCTIONS_ID,
	collectServerFunctionModuleIds,
	configureRouterPreviewServer,
	serverFunctionsPlugin,
};
export type {
	CollectServerFunctionModuleOptions,
	RouterPreviewOptions,
	ServerFunctionPluginContext,
	ServerFunctionsPluginOptions,
};

export const QWIK_ROUTER_CONFIG_ID = '@qwik-router-config';
export const QWIK_ROUTER_ENTRIES_ID = '@qwik-router-entries';
export const QWIK_ROUTER_SW_REGISTER_ID = '@qwik-router-sw-register';

const QWIK_ROUTER = '@qwik.dev/router';
const DEFAULT_CLIENT_INPUT = 'src/root.tsx';
const ROUTE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const ROUTE_BASENAMES = new Set(['index', 'layout', '404', 'error']);

export interface QwikRouterVitePluginOptions {
	/** Client build input to use when the host has not supplied one. Defaults to `src/root.tsx`. */
	clientInput?: string | string[] | Record<string, string>;
	/** Environment name used for the client build. Defaults to `client`. */
	clientEnvironment?: string;
	/** Directory containing Qwik Router routes. Defaults to `src/routes`. */
	routesDir?: string;
	/** Directory containing Qwik Router server plugins. Defaults to `routesDir`. */
	serverPluginsDir?: string;
	/** Use static route imports in generated router config. Defaults to dynamic imports. */
	staticImportRoutes?: boolean;
	/** Configure Vite preview to serve the built SSR preview entry. */
	preview?: RouterPreviewOptions | false;
	/** Client manifest imported into server builds. Defaults to `dist/q-manifest.json`. */
	clientManifest?: string | false;
	/** Enable the basic dev SSR fallback middleware. Defaults to `true`. */
	devSsrServer?: boolean;
	/** Match Qwik Router's trailing slash define. Defaults to `true`. */
	trailingSlash?: boolean;
	/** Match Qwik Router's loader serialization define. Defaults to `never`. */
	defaultLoadersSerializationStrategy?: string;
	/** Platform data passed to the dev middleware's Qwik Router adapter. */
	platform?: Record<string, unknown>;
	/** Server function virtual-module options for non-router hosts. */
	serverFunctions?: Partial<Pick<ServerFunctionsPluginOptions, 'virtualId'>>;
}

export type QwikCityVitePluginOptions = QwikRouterVitePluginOptions;

export interface BuiltRouterRoute {
	id: string;
	filePath: string;
	pathname: string;
	routeName: string;
	layouts: BuiltRouterLayout[];
}

export interface BuiltRouterLayout {
	id: string;
	filePath: string;
	pathname: string;
}

export interface QwikRouterPluginApi {
	getBasePathname: () => string;
	getRoutes: () => BuiltRouterRoute[];
	getServiceWorkers: () => [];
}

export type QwikRouterPlugin = Plugin & {
	name: 'vite-plugin-qwik-router';
	api: QwikRouterPluginApi;
};

/** @deprecated Use `qwikRouter` instead. */
export function qwikCity(options?: QwikCityVitePluginOptions): PluginOption[] {
	return qwikRouter(options);
}

export function qwikRouter(options: QwikRouterVitePluginOptions = {}): PluginOption[] {
	const state: RouterState = {
		base: '/',
		dirty: true,
		dynamicImports: !options.staticImportRoutes,
		layouts: [],
		rootDir: '',
		routes: [],
		routesDir: '',
		serverPlugins: [],
		serverPluginsDir: '',
	};

	const router = qwikRouterPlugin(options, state);
	const serverFunctions = serverFunctionsPlugin({
		name: 'vite-plugin-qwik-router-server-functions',
		virtualId: options.serverFunctions?.virtualId ?? QWIK_ROUTER_SERVER_FUNCTIONS_ID,
		moduleGlobs: () => [routeSourceGlob(state)],
	});

	return [router, serverFunctions];
}

function qwikRouterPlugin(
	options: QwikRouterVitePluginOptions,
	state: RouterState,
): QwikRouterPlugin {
	let viteCommand: ConfigEnv['command'] = 'serve';
	let devServer: ViteDevServer | null = null;

	const api: QwikRouterPluginApi = {
		getBasePathname: () => state.base,
		getRoutes: () => state.routes.slice(),
		getServiceWorkers: () => [],
	};

	return {
		name: 'vite-plugin-qwik-router',
		enforce: 'pre',
		api,

		config(config, env) {
			viteCommand = env.command;
			applyRouterClientInput(config, options, env);

			return routerViteConfig(options);
		},

		configEnvironment(name: string) {
			if (name !== 'ssr') {
				return {};
			}
			return {
				resolve: {
					noExternal: [
						QWIK_ROUTER,
						QWIK_ROUTER_CONFIG_ID,
						QWIK_ROUTER_ENTRIES_ID,
						QWIK_ROUTER_SW_REGISTER_ID,
						'zod',
					],
				},
			} satisfies EnvironmentOptions;
		},

		configResolved(config) {
			state.base = normalizeBase(config.base);
			state.rootDir = resolve(config.root);
			state.routesDir = resolve(state.rootDir, options.routesDir ?? 'src/routes');
			state.serverPluginsDir = resolve(
				state.rootDir,
				options.serverPluginsDir ?? options.routesDir ?? 'src/routes',
			);

			const qwikPlugin = config.plugins.find(
				(plugin) => plugin.name === 'vite-plugin-qwik',
			) as QwikVitePluginApiHost | undefined;
			qwikPlugin?.api?.registerBundleGraphAdder?.(createRouteBundleGraphAdder(state));
		},

		configureServer(server) {
			devServer = server;
			const routeGlob = join(state.routesDir, '**/{index,layout,404,error,plugin@*}{.,@,-}*');
			server.watcher.add(routeGlob);
			server.watcher.on('change', (path) => {
				if (!isRouteSource(path) && !basename(path).startsWith('plugin@')) {
					return;
				}
				state.dirty = true;
				invalidateRouterConfig(server);
			});

			if (options.devSsrServer === false) {
				return;
			}

			return () => {
				server.middlewares.use(createDevSsrMiddleware(server, state, options));
			};
		},

		transformIndexHtml() {
			if (viteCommand !== 'serve' || !devServer) {
				return;
			}
			return getRouterIndexTags(devServer);
		},

		buildStart() {
			state.dirty = true;
		},

		resolveId(id) {
			if (id === QWIK_ROUTER_CONFIG_ID || id === QWIK_ROUTER_ENTRIES_ID) {
				return { id, moduleSideEffects: 'no-treeshake' };
			}
			if (id === QWIK_ROUTER_SW_REGISTER_ID) {
				return id;
			}
			return null;
		},

		async load(id) {
			if (id.endsWith(QWIK_ROUTER_CONFIG_ID)) {
				return generateRouterConfig(
					state,
					options,
					this.environment.config.consumer === 'server',
					this.environment.mode === 'build',
				);
			}
			if (id.endsWith(QWIK_ROUTER_ENTRIES_ID)) {
				return '// No router entries';
			}
			if (id.endsWith(QWIK_ROUTER_SW_REGISTER_ID)) {
				return 'export default function QwikRouterServiceWorker() { return null; }';
			}
			return null;
		},

		async configurePreviewServer(server) {
			if (options.preview === false) {
				return;
			}
			const preview = options.preview;
			return async () => {
				await configureRouterPreviewServer(server, state.rootDir, preview);
			};
		},
	};
}

function routerViteConfig(options: QwikRouterVitePluginOptions): UserConfig {
	const routesDir = options.routesDir ?? 'src/routes';
	const serverPluginsDir = options.serverPluginsDir ?? routesDir;

	return {
		appType: 'custom',
		define: {
			'globalThis.__DEFAULT_LOADERS_SERIALIZATION_STRATEGY__': JSON.stringify(
				options.defaultLoadersSerializationStrategy ?? 'never',
			),
			'globalThis.__NO_TRAILING_SLASH__': JSON.stringify(options.trailingSlash === false),
			'globalThis.__SSR_CACHE_SIZE__': '50',
		},
		resolve: {
			dedupe: [QWIK_ROUTER, '@builder.io/qwik-city'],
			alias: [
				{ find: '@builder.io/qwik-city', replacement: QWIK_ROUTER },
				{ find: /^@builder\.io\/qwik-city\/(.*)/, replacement: `${QWIK_ROUTER}/$1` },
				{ find: '@qwik-city-plan', replacement: QWIK_ROUTER_CONFIG_ID },
				{ find: '@qwik-city-entries', replacement: QWIK_ROUTER_ENTRIES_ID },
				{ find: '@qwik-city-sw-register', replacement: QWIK_ROUTER_SW_REGISTER_ID },
			],
		},
		optimizeDeps: {
			entries: [
				`${routesDir}/**/index*`,
				`${routesDir}/**/layout*`,
				`${serverPluginsDir}/plugin@*`,
			],
			exclude: [
				QWIK_ROUTER,
				QWIK_ROUTER_CONFIG_ID,
				QWIK_ROUTER_ENTRIES_ID,
				QWIK_ROUTER_SW_REGISTER_ID,
			],
		},
		ssr: {
			noExternal: [
				QWIK_ROUTER,
				QWIK_ROUTER_CONFIG_ID,
				QWIK_ROUTER_ENTRIES_ID,
				QWIK_ROUTER_SW_REGISTER_ID,
				'zod',
			],
		},
		server: {
			watch: {
				disableGlobbing: false,
			},
		},
	};
}

function applyRouterClientInput(
	config: UserConfig,
	options: QwikRouterVitePluginOptions,
	env: ConfigEnv,
) {
	if (config.build?.lib || config.build?.ssr || env.mode === 'ssr') {
		return;
	}
	if (hasBuildInput(config.build)) {
		return;
	}

	const input = options.clientInput ?? DEFAULT_CLIENT_INPUT;
	const clientEnvironment = options.clientEnvironment ?? 'client';
	const environments = config.environments as
		| Record<string, { build?: RouterBuildOptions }>
		| undefined;
	const clientConfig = environments?.[clientEnvironment];

	if (clientConfig) {
		const build = (clientConfig.build ??= {});
		if (hasBuildInput(build)) {
			return;
		}
		const rolldownOptions = (build.rolldownOptions ??= {});
		rolldownOptions.input ??= input;
		return;
	}

	const build = (config.build ??= {});
	const rolldownOptions = ((build as RouterBuildOptions).rolldownOptions ??= {});
	rolldownOptions.input ??= input;
}

function generateRouterConfig(
	state: RouterState,
	options: QwikRouterVitePluginOptions,
	isServer: boolean,
	isBuild: boolean,
) {
	const imports: string[] = [`import { isDev } from '@qwik.dev/core/build';`];
	const setup: string[] = [];
	if (isServer && isBuild && options.clientManifest !== false) {
		imports.push(
			`import manifest from ${JSON.stringify(rootImportPath(state, options.clientManifest ?? 'dist/q-manifest.json'))};`,
		);
		setup.push('globalThis.__QWIK_MANIFEST__ = manifest;');
	}
	if (isServer) {
		imports.push(`import ${JSON.stringify(QWIK_ROUTER_SERVER_FUNCTIONS_ID)};`);
	}

	return [
		'/** Qwik Router Config */',
		...imports,
		...setup,
		`const routeModules = import.meta.glob(${JSON.stringify(routeModuleGlobs(state))}${state.dynamicImports ? '' : ', { eager: true }'});`,
		`const serverPluginModules = import.meta.glob(${JSON.stringify(serverPluginGlob(state))}, { eager: true });`,
		routerConfigRuntimeCode(),
		`export const routes = createRoutes(routeModules, ${JSON.stringify(!state.dynamicImports)}, ${JSON.stringify(routeImportBase(state))});`,
		`export const serverPlugins = Object.values(serverPluginModules);`,
		`export const trailingSlash = ${JSON.stringify(options.trailingSlash !== false)};`,
		`export const basePathname = ${JSON.stringify(state.base)};`,
		`export const cacheModules = !isDev;`,
		`export default { routes, serverPlugins, trailingSlash, basePathname, cacheModules };`,
	].join('\n');
}

function routeImportBase(state: RouterState) {
	const rel = relative(state.rootDir, state.routesDir).split('/').filter(Boolean).join('/');
	return `/${rel || '.'}`.replace('/.', '');
}

function serverPluginImportBase(state: RouterState) {
	const rel = relative(state.rootDir, state.serverPluginsDir)
		.split('/')
		.filter(Boolean)
		.join('/');
	return `/${rel || '.'}`.replace('/.', '');
}

function routeModuleGlobs(state: RouterState) {
	const base = routeImportBase(state);
	return [...ROUTE_BASENAMES].flatMap((name) =>
		[...ROUTE_EXTENSIONS].map((ext) => `${base}/**/${name}*${ext}`),
	);
}

function routeSourceGlob(state: RouterState) {
	return `${routeImportBase(state)}/**/*.{js,jsx,ts,tsx}`;
}

function serverPluginGlob(state: RouterState) {
	return `${serverPluginImportBase(state)}/**/plugin@*.{js,jsx,ts,tsx}`;
}

function rootImportPath(state: RouterState, path: string) {
	if (path.startsWith('/')) {
		return path;
	}
	const rel = relative(state.rootDir, resolve(state.rootDir, path))
		.split('/')
		.filter(Boolean)
		.join('/');
	return `/${rel}`;
}

function routerConfigRuntimeCode() {
	return String.raw`
function createRoutes(modules, eager, routesBase) {
	const root = {};
	const paths = Object.keys(modules).sort();
	for (const path of paths) {
		if (routeBasename(path) !== 'layout') continue;
		routeNode(root, routeSegments(routePathname(path, routesBase)))._L = routeLoader(modules, path, eager);
	}
	for (const path of paths) {
		const name = routeBasename(path);
		if (name !== 'index' && name !== '404' && name !== 'error') continue;
		const record = routeNode(root, routeSegments(routePathname(path, routesBase)));
		const loader = routeLoader(modules, path, eager);
		if (name === '404') record._4 = loader;
		else if (name === 'error') record._E = loader;
		else record._I = loader;
	}
	return root;
}
function routeLoader(modules, path, eager) {
	return eager ? () => modules[path] : modules[path];
}
function routeNode(root, segments) {
	let current = root;
	for (const segment of segments) {
		const next = current[segment.key] || (current[segment.key] = {});
		if (segment.param) next._P = segment.param;
		current = next;
	}
	return current;
}
function routeSegments(pathname) {
	return pathname.split('/').filter(Boolean).flatMap((segment) => {
		if (segment.startsWith('(') && segment.endsWith(')')) return [];
		const rest = /^\[\.\.\.(.+)\]$/.exec(segment);
		if (rest?.[1]) return [{ key: '_A', param: rest[1] }];
		const dynamic = /^\[(.+)\]$/.exec(segment);
		if (dynamic?.[1]) return [{ key: '_W', param: dynamic[1] }];
		return [{ key: segment.toLowerCase() }];
	});
}
function routePathname(path, routesBase) {
	const clean = path.split('?')[0];
	const dir = clean.slice(0, clean.lastIndexOf('/'));
	const rel = (dir.startsWith(routesBase) ? dir.slice(routesBase.length) : dir).replace(/^\/+|\/+$/g, '');
	return rel ? '/' + rel : '/';
}
function routeBasename(path) {
	const file = path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
	const marker = file.search(/[.@-]/);
	return marker === -1 ? file : file.slice(0, marker);
}
`;
}

function routeBasename(filePath: string) {
	const ext = extname(filePath);
	const name = basename(filePath, ext);
	const marker = name.search(/[.@-]/);
	return marker === -1 ? name : name.slice(0, marker);
}

function routeUsesLayout(routePathname: string, layoutPathname: string) {
	return (
		layoutPathname === '/' ||
		routePathname === layoutPathname ||
		routePathname.startsWith(`${layoutPathname}/`)
	);
}

function importPath(filePath: string) {
	const ext = extname(filePath).toLowerCase();
	if (ext === '.tsx' || ext === '.jsx') {
		return filePath.slice(0, -4);
	}
	if (ext === '.ts') {
		return filePath.slice(0, -3);
	}
	return filePath;
}

function isRouteSource(filePath: string) {
	if (!ROUTE_EXTENSIONS.has(extname(filePath).toLowerCase())) {
		return false;
	}
	return ROUTE_BASENAMES.has(routeBasename(filePath));
}

function createRouteBundleGraphAdder(state: RouterState): BundleGraphAdder {
	return (manifest) => {
		const result: Record<string, { imports?: string[]; dynamicImports?: string[] }> = {};
		for (const route of manifestRoutes(state, manifest)) {
			const bundles = routeBundles(route, manifest);
			if (bundles.length > 0) {
				result[route.routeName] = { dynamicImports: bundles };
			}
		}
		return result;
	};
}

function manifestRoutes(state: RouterState, manifest: QwikManifest) {
	const routeFiles = new Set<string>();
	const layoutFiles = new Set<string>();

	for (const bundle of Object.values(manifest.bundles)) {
		for (const origin of bundle.origins ?? []) {
			if (!isManifestRouteSource(state, origin)) {
				continue;
			}
			if (routeBasename(origin) === 'layout') {
				layoutFiles.add(origin);
			} else {
				routeFiles.add(origin);
			}
		}
	}

	const layouts = [...layoutFiles].sort().map((filePath, index) => ({
		id: `layout${index}`,
		filePath,
		pathname: manifestRoutePathname(state, filePath),
	}));

	return [...routeFiles].sort().map((filePath, index) => {
		const pathname = manifestRoutePathname(state, filePath);
		return {
			id: `route${index}`,
			filePath,
			pathname,
			routeName: pathname === '/' ? 'index' : pathname.slice(1).replaceAll('/', '_'),
			layouts: layouts.filter((layout) => routeUsesLayout(pathname, layout.pathname)),
		};
	});
}

function isManifestRouteSource(state: RouterState, origin: string) {
	const routesDir = relative(state.rootDir, state.routesDir);
	if (!origin.startsWith(`${routesDir}/`)) {
		return false;
	}
	return isRouteSource(origin);
}

function manifestRoutePathname(state: RouterState, filePath: string) {
	const routesDir = relative(state.rootDir, state.routesDir);
	const dir = dirname(filePath);
	const rel = relative(routesDir, dir);
	if (!rel || rel === '.') {
		return '/';
	}
	return `/${rel.split('/').filter(Boolean).join('/')}`;
}

function routeBundles(route: BuiltRouterRoute, manifest: QwikManifest) {
	const routeOrigins = [route.filePath, ...route.layouts.map((layout) => layout.filePath)].map(
		(filePath) => importPath(filePath),
	);
	const bundles: string[] = [];
	for (const [bundleName, bundle] of Object.entries(manifest.bundles)) {
		if (!bundle.origins) {
			continue;
		}
		if (
			bundle.origins.some((origin) => {
				const normalizedOrigin = importPath(origin);
				return routeOrigins.some((routeOrigin) => routeOrigin.endsWith(normalizedOrigin));
			})
		) {
			bundles.push(bundleName);
		}
	}
	return bundles.sort();
}

function normalizeBase(base: string) {
	if (!base.startsWith('/')) {
		return `/${base}`;
	}
	return base.endsWith('/') ? base : `${base}/`;
}

function invalidateRouterConfig(server: ViteDevServer) {
	for (const environment of Object.values(server.environments)) {
		const mod = environment.moduleGraph?.getModuleById(QWIK_ROUTER_CONFIG_ID);
		if (mod) {
			environment.moduleGraph.invalidateModule(mod);
		}
	}
}

function createDevSsrMiddleware(
	server: ViteDevServer,
	state: RouterState,
	options: QwikRouterVitePluginOptions,
) {
	return async (req: ConnectRequest, res: ConnectResponse, next: () => void) => {
		let mod: { default?: (options: unknown) => unknown };
		try {
			mod = (await server.ssrLoadModule('src/entry.ssr')) as {
				default?: (options: unknown) => unknown;
			};
		} catch (error) {
			if (error instanceof Error) {
				server.ssrFixStacktrace(error);
			}
			next();
			return;
		}
		if (!mod.default) {
			next();
			return;
		}

		try {
			const { createQwikRouter } = (await server.ssrLoadModule(
				'@qwik.dev/router/middleware/node',
			)) as {
				createQwikRouter: (options: unknown) => {
					router: (req: ConnectRequest, res: ConnectResponse, next: () => void) => void;
					staticFile: (
						req: ConnectRequest,
						res: ConnectResponse,
						next: () => void,
					) => void;
				};
			};
			const { router, staticFile } = createQwikRouter({
				render: mod.default,
				platform: options.platform,
			});

			staticFile(req, res, () => router(req, res, next));
		} catch (error) {
			if (error instanceof Error) {
				server.ssrFixStacktrace(error);
			}
			next();
		}
	};
}

function getRouterIndexTags(server: ViteDevServer) {
	const cssUrls = new Set<string>();
	for (const graph of [
		server.environments.client?.moduleGraph,
		server.environments.ssr?.moduleGraph,
	]) {
		if (!graph) continue;
		for (const mod of graph.idToModuleMap.values()) {
			const [path] = mod.url.split('?');
			if (path && isCssPath(path) && mod.importers.size === 0) {
				cssUrls.add(mod.url);
			}
		}
	}
	return [...cssUrls].sort().map((href) => ({
		tag: 'link',
		attrs: { rel: 'stylesheet', href },
	}));
}

function isCssPath(path: string) {
	return ['.css', '.scss', '.sass', '.less', '.styl', '.stylus'].some((ext) =>
		path.endsWith(ext),
	);
}

type RouterState = {
	base: string;
	dirty: boolean;
	dynamicImports: boolean;
	layouts: BuiltRouterLayout[];
	rootDir: string;
	routes: BuiltRouterRoute[];
	routesDir: string;
	serverPlugins: string[];
	serverPluginsDir: string;
};

type RouterBuildOptions = {
	rolldownOptions?: { input?: unknown };
};

function hasBuildInput(build: RouterBuildOptions | undefined) {
	return !!build?.rolldownOptions?.input;
}

type QwikVitePluginApiHost = Plugin & {
	api?: {
		registerBundleGraphAdder?: (adder: BundleGraphAdder) => void;
	};
};

type ConnectRequest = Parameters<import('vite').Connect.NextHandleFunction>[0];
type ConnectResponse = Parameters<import('vite').Connect.NextHandleFunction>[1];
