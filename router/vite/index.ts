import { basename, dirname, extname, join, relative, resolve } from 'pathe';
import { decodePath, parseURL, withLeadingSlash, withTrailingSlash } from 'ufo';
import type { ConfigEnv, EnvironmentOptions, PluginOption, UserConfig, ViteDevServer } from 'vite';
import type { BundleGraphAdder, QwikManifest, QwikOptimizerStripNames } from '../../src/types.ts';
import { createRouterDevEnvironment } from './dev/environment.ts';
import { createRouterDevRequestHandler } from './dev/request.ts';
import { getRouterIndexTags } from './dev/styles.ts';
import { imagePlugin } from './image.ts';
import { isMenuRoute, transformMenuRoute } from './menu.ts';
import {
	isMdxFrontmatterRoute,
	isMdxRoute,
	transformMdxFrontmatterRoute,
	transformMdxRoute,
} from './mdx/index.ts';
import { configureRouterPreviewServer, type RouterPreviewOptions } from './preview.ts';
import {
	QWIK_ROUTER_SERVER_FUNCTIONS_ID,
	serverFunctionsPlugin,
	type ServerFunctionsPluginOptions,
} from './server-functions.ts';
import { layoutName, routeBasename, routeLayouts } from './routes.ts';
import type {
	BuiltRouterLayout,
	BuiltRouterRoute,
	QwikCityVitePluginOptions,
	QwikRouterPlugin,
	QwikRouterPluginApi,
	QwikRouterVitePluginOptions,
	QwikVitePluginApiHost,
	RouterBuildOptions,
	RouterMdxOptions,
	RouterServerFunctionsOptions,
	RouterState,
} from './types.ts';

export { QWIK_ROUTER_SERVER_FUNCTIONS_ID, configureRouterPreviewServer, serverFunctionsPlugin };
export { imagePlugin };
export type {
	BuiltRouterLayout,
	BuiltRouterRoute,
	QwikCityVitePluginOptions,
	QwikRouterPlugin,
	QwikRouterPluginApi,
	QwikRouterVitePluginOptions,
	RouterMdxOptions,
	RouterPreviewOptions,
	RouterServerFunctionsOptions,
	ServerFunctionsPluginOptions,
};

export const QWIK_ROUTER_CONFIG_ID = '@qwik-router-config';
export const QWIK_ROUTER_ENTRIES_ID = '@qwik-router-entries';
export const QWIK_ROUTER_SW_REGISTER_ID = '@qwik-router-sw-register';

const QWIK_ROUTER_RUNTIME_ID = '@qwik-router-runtime';
const QWIK_ROUTER = '@qwik.dev/router';
const ROUTER_NO_EXTERNAL = [
	QWIK_ROUTER,
	QWIK_ROUTER_CONFIG_ID,
	QWIK_ROUTER_ENTRIES_ID,
	QWIK_ROUTER_SW_REGISTER_ID,
	// TODO: Remove the Zod special case once Qwik Router accepts Standard Schema validators.
	'zod',
];
const DEFAULT_CLIENT_INPUT = 'src/root.tsx';
const DEFAULT_SERVER_INPUT = 'src/entry.ssr.tsx';
const ROUTER_OPTIMIZER_STRIP_NAMES = {
	client: {
		ctxName: ['route', 'zod$', 'validator$', 'globalAction$'],
		exports: [
			'onGet',
			'onPost',
			'onPut',
			'onRequest',
			'onDelete',
			'onHead',
			'onOptions',
			'onPatch',
			'onStaticGenerate',
		],
	},
} satisfies QwikOptimizerStripNames;
const ROUTE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.md', '.mdx', '.markdown']);
const ROUTE_BASENAMES = new Set(['index', 'layout', '404', 'error']);
const SERVER_MODULE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const ROUTE_TEST_MODULES = '**/*.{test,unit,spec}.{js,jsx,ts,tsx,md,mdx,markdown}';
const SERVER_TEST_MODULES = '**/*.{test,unit,spec}.{js,jsx,ts,tsx}';

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
		moduleGlobs: () => serverFunctionModuleGlobs(state),
	});

	return [router, serverFunctions, ...imagePlugin(options)];
}

function qwikRouterPlugin(
	options: QwikRouterVitePluginOptions,
	state: RouterState,
): QwikRouterPlugin {
	let viteCommand: ConfigEnv['command'] = 'serve';
	let devServer: ViteDevServer | null = null;
	let deprecatedUnifiedMdxWarned = false;

	const api: QwikRouterPluginApi = {
		getBasePathname: () => state.base,
		getRoutes: () => state.routes.slice(),
		getServiceWorkers: () => [],
	};

	return {
		name: 'vite-plugin-qwik-router',
		enforce: 'pre',
		sharedDuringBuild: true,
		api,

		config(config, env) {
			viteCommand = env.command;
			applyRouterClientInput(config, options, env);
			applyRouterPreviewEnvironment(config, options, env);
			applyRouterPreviewOutput(config, options, env);

			return routerViteConfig(options);
		},

		configEnvironment(name: string, config) {
			if (name !== (options.serverEnvironment ?? 'ssr')) {
				return {};
			}
			const build = config.build ?? {};
			const rolldownOptions = build.rolldownOptions ?? {};
			const environment: EnvironmentOptions = {
				consumer: 'server',
				build: {
					...build,
					rolldownOptions: {
						...rolldownOptions,
						input: rolldownOptions.input ?? DEFAULT_SERVER_INPUT,
					},
				},
				resolve: {
					noExternal: ROUTER_NO_EXTERNAL,
				},
			} satisfies EnvironmentOptions;
			if (options.devSsrServer !== false && !config.dev?.createEnvironment) {
				environment.dev = {
					createEnvironment: createRouterDevEnvironment(options),
				};
			}
			return environment;
		},

		buildApp: {
			order: 'post',
			async handler(builder) {
				const preview = builder.environments.preview;
				if (options.preview !== false && preview && !preview.isBuilt) {
					await builder.build(preview);
				}
			},
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
			qwikPlugin?.api?.registerOptimizerStripNames?.(ROUTER_OPTIMIZER_STRIP_NAMES);
		},

		configureServer(server) {
			devServer = server;
			const routeGlob = join(
				state.routesDir,
				'**/{index,layout,404,error,menu,plugin@*}{.,@,-}*',
			);
			server.watcher.add(routeGlob);
			server.watcher.on('change', (path) => {
				if (
					!isRouteSource(path) &&
					!isMenuRoute(path) &&
					!basename(path).startsWith('plugin@')
				) {
					return;
				}
				state.dirty = true;
				invalidateRouterConfig(server);
			});

			if (options.devSsrServer === false) {
				return;
			}

			return () => {
				server.middlewares.use(createRouterDevRequestHandler(server, options));
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
			if (id === QWIK_ROUTER_RUNTIME_ID) {
				return runtimeModulePath();
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

		async transform(code, id) {
			if (isMdxFrontmatterRoute(id)) {
				return {
					code: transformMdxFrontmatterRoute(code),
					map: null,
				};
			}
			if (parseURL(id).search) return null;
			if (isMenuRoute(id)) {
				return {
					code: transformMenuRoute(code, id, state),
					map: null,
				};
			}
			if (!isMdxRoute(id)) {
				return null;
			}
			const warnDeprecatedUnifiedMdx = () => {
				if (deprecatedUnifiedMdxWarned) {
					return;
				}
				deprecatedUnifiedMdxWarned = true;
				this.warn(
					'qwik-router mdx.remarkPlugins and mdx.rehypePlugins are deprecated for the Satteri MDX pipeline. Use mdx.mdastPlugins/mdx.hastPlugins for Satteri-native plugins, or keep this as a temporary unified compatibility path.',
				);
			};
			return {
				code: await transformMdxRoute(code, id, options.mdx, options.mdxPlugins, {
					warnDeprecatedUnifiedMdx,
				}),
				map: null,
			};
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
			noExternal: ROUTER_NO_EXTERNAL,
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

function applyRouterPreviewOutput(
	config: UserConfig,
	options: QwikRouterVitePluginOptions,
	env: ConfigEnv,
) {
	if (env.command !== 'build' || options.preview === false || !config.build?.ssr) {
		return;
	}

	config.build.outDir ??= options.preview?.ssrOutDir ?? 'server';
}

function applyRouterPreviewEnvironment(
	config: UserConfig,
	options: QwikRouterVitePluginOptions,
	env: ConfigEnv,
) {
	if (
		env.command !== 'build' ||
		options.preview === false ||
		config.build?.lib ||
		config.build?.ssr
	) {
		return;
	}

	const environment = ((config.environments ??= {}).preview ??= {});
	environment.consumer ??= 'server';
	const resolve = (environment.resolve ??= {});
	resolve.noExternal ??= ROUTER_NO_EXTERNAL;
	const build = (environment.build ??= {});
	build.outDir ??= options.preview?.ssrOutDir ?? 'server';
	const rolldownOptions = ((build as RouterBuildOptions).rolldownOptions ??= {});
	const entry =
		options.preview && typeof options.preview === 'object' ? options.preview.entry : null;
	rolldownOptions.input ??= `src/${entry ?? 'entry.preview'}.tsx`;
}

function generateRouterConfig(
	state: RouterState,
	options: QwikRouterVitePluginOptions,
	isServer: boolean,
) {
	const imports: string[] = [
		`import { isDev } from '@qwik.dev/core/build';`,
		`import { createRoutes } from ${JSON.stringify(QWIK_ROUTER_RUNTIME_ID)};`,
	];
	if (isServer) {
		imports.push(`import ${JSON.stringify(QWIK_ROUTER_SERVER_FUNCTIONS_ID)};`);
	}

	return [
		'/** Qwik Router Config */',
		...imports,
		`const routeModules = import.meta.glob(${JSON.stringify(routeModuleGlobs(state))}${state.dynamicImports ? '' : ', { eager: true }'});`,
		`const serverPluginModules = import.meta.glob(${JSON.stringify(serverPluginGlob(state))}, { eager: true });`,
		`export const routes = createRoutes(routeModules, ${JSON.stringify(!state.dynamicImports)}, ${JSON.stringify(routeImportBase(state))});`,
		`export const serverPlugins = Object.values(serverPluginModules);`,
		`export const trailingSlash = ${JSON.stringify(options.trailingSlash !== false)};`,
		`export const basePathname = ${JSON.stringify(state.base)};`,
		`export const cacheModules = !isDev;`,
		`export default { routes, serverPlugins, trailingSlash, basePathname, cacheModules };`,
	].join('\n');
}

function runtimeModulePath() {
	const current = decodePath(parseURL(import.meta.url).pathname);
	return resolve(dirname(current), extname(current) === '.ts' ? 'runtime.ts' : 'runtime.mjs');
}

function routeImportBase(state: RouterState) {
	return importBase(state.rootDir, state.routesDir);
}

function serverPluginImportBase(state: RouterState) {
	return importBase(state.rootDir, state.serverPluginsDir);
}

function importBase(rootDir: string, sourceDir: string) {
	const rel = cleanRelativePath(relative(rootDir, sourceDir));
	if (!rel) {
		return '';
	}
	return withLeadingSlash(rel);
}

function routeModuleGlobs(state: RouterState) {
	const base = routeImportBase(state);
	const sourceGlobs = [...ROUTE_BASENAMES].flatMap((name) =>
		[...ROUTE_EXTENSIONS].map((ext) => `${base}/**/${name}*${ext}`),
	);
	const menuGlobs = ['.md', '.mdx', '.markdown'].map((ext) => `${base}/**/menu${ext}`);
	return [...sourceGlobs, ...menuGlobs, `!${base}/${ROUTE_TEST_MODULES}`];
}

function serverFunctionModuleGlobs(state: RouterState) {
	const base = importBase(state.rootDir, dirname(state.routesDir));
	return SERVER_MODULE_EXTENSIONS.map((ext) => `${base}/**/*.server${ext}`);
}

function serverPluginGlob(state: RouterState) {
	const base = serverPluginImportBase(state);
	return [`${base}/**/plugin@*.{js,jsx,ts,tsx}`, `!${base}/${SERVER_TEST_MODULES}`];
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
				result[preloadRouteName(route.pathname)] = { dynamicImports: bundles };
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
		name: layoutName(filePath),
		pathname: manifestRoutePathname(state, filePath),
	}));

	return [...routeFiles].sort().map((filePath, index) => {
		const pathname = manifestRoutePathname(state, filePath);
		return {
			id: `route${index}`,
			filePath,
			pathname,
			routeName: routeName(pathname),
			layouts: routeLayouts(layouts, pathname, filePath),
		};
	});
}

function routeName(pathname: string) {
	if (pathname === '/') {
		return 'index';
	}
	return pathname.slice(1).replaceAll('/', '_');
}

function preloadRouteName(pathname: string) {
	if (pathname === '/') {
		return '/';
	}
	const name = pathname.slice(1);
	return name.endsWith('/') ? name : `${name}/`;
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
	return withLeadingSlash(cleanRelativePath(rel));
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
	return withTrailingSlash(withLeadingSlash(base));
}

function cleanRelativePath(path: string) {
	return path.split('/').filter(Boolean).join('/');
}

function invalidateRouterConfig(server: ViteDevServer) {
	for (const environment of Object.values(server.environments)) {
		const mod = environment.moduleGraph?.getModuleById(QWIK_ROUTER_CONFIG_ID);
		if (mod) {
			environment.moduleGraph.invalidateModule(mod);
		}
	}
}

function hasBuildInput(build: RouterBuildOptions | undefined) {
	return !!build?.rolldownOptions?.input;
}
