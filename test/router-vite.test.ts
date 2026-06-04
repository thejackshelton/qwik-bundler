import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import type { Plugin, UserConfig } from 'vite';
import { describe, expect, test, vi } from 'vitest';
import {
	QWIK_ROUTER_CONFIG_ID,
	QWIK_ROUTER_SERVER_FUNCTIONS_ID,
	configureRouterPreviewServer,
	qwikRouter,
	serverFunctionsPlugin,
} from '../router/vite/index.ts';
import { staticAdapter } from '../adapters/static/vite.ts';
import {
	callBuildStart,
	callBuildApp,
	callConfig,
	callConfigEnvironment,
	callConfigResolved,
	callConfigureServer,
	callGenerateBundle,
	callLoad,
	callResolveId,
	callTransform,
	callTransformIndexHtml,
	createViteHookContext,
	getPlugin,
} from './helpers.ts';

describe('Qwik Router Vite integration', () => {
	test('provides the router-owned default client input', async () => {
		const plugin = getRouterPlugin();
		const config: UserConfig = {};

		const result = await callConfig(plugin, config, {
			command: 'build',
			mode: 'production',
		});

		expect(config.build?.rolldownOptions?.input).toBe('src/root.tsx');
		expect(result).toMatchObject({
			appType: 'custom',
			resolve: {
				dedupe: ['@qwik.dev/router', '@builder.io/qwik-city'],
			},
		});
	});

	test('does not replace host-supplied client input', async () => {
		const plugin = getRouterPlugin();
		const config: UserConfig = {
			build: {
				rolldownOptions: {
					input: 'src/custom-root.tsx',
				},
			},
		};

		await callConfig(plugin, config, { command: 'build', mode: 'production' });

		expect(config.build?.rolldownOptions?.input).toBe('src/custom-root.tsx');
	});

	test('registers router-owned optimizer strip names with the Qwik plugin', () => {
		const plugin = getRouterPlugin();
		const registerBundleGraphAdder = vi.fn();
		const registerOptimizerStripNames = vi.fn();

		callConfigResolved(plugin, {
			base: '/',
			build: {},
			plugins: [
				{
					name: 'vite-plugin-qwik',
					api: {
						registerBundleGraphAdder,
						registerOptimizerStripNames,
					},
				},
			],
			root: '/workspace/app',
		});

		expect(registerBundleGraphAdder).toHaveBeenCalledTimes(1);
		expect(registerOptimizerStripNames).toHaveBeenCalledWith({
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
		});
	});

	test('adds route bundle graph entries with runtime preload route keys', () => {
		const plugin = getRouterPlugin();
		const registerBundleGraphAdder = vi.fn();

		callConfigResolved(plugin, {
			base: '/',
			build: {},
			plugins: [
				{
					name: 'vite-plugin-qwik',
					api: {
						registerBundleGraphAdder,
					},
				},
			],
			root: '/project',
		});

		const addRouteBundles = registerBundleGraphAdder.mock.calls[0]?.[0];
		expect(addRouteBundles).toEqual(expect.any(Function));

		const graph = addRouteBundles({
			bundles: {
				'build/q-components-layout.js': {
					origins: ['src/routes/components/layout.tsx'],
				},
				'build/q-components-narrow-layout.js': {
					origins: ['src/routes/components/layout-narrow.tsx'],
				},
				'build/q-layout.js': {
					origins: ['src/routes/layout.tsx'],
				},
				'build/q-root.js': {
					origins: ['src/routes/index.tsx'],
				},
				'build/q-textbox.js': {
					origins: ['src/routes/components/textbox/index.mdx'],
				},
				'build/q-visualizer.js': {
					origins: ['src/routes/components/visualizer/index@narrow.tsx'],
				},
			},
		});

		expect(graph).toEqual({
			'/': {
				dynamicImports: ['build/q-layout.js', 'build/q-root.js'],
			},
			'components/textbox/': {
				dynamicImports: [
					'build/q-components-layout.js',
					'build/q-layout.js',
					'build/q-textbox.js',
				],
			},
			'components/visualizer/': {
				dynamicImports: [
					'build/q-components-narrow-layout.js',
					'build/q-layout.js',
					'build/q-visualizer.js',
				],
			},
		});
		expect(graph).not.toHaveProperty('components_textbox');
	});

	test('sets the default input on an existing client environment', async () => {
		const plugin = getRouterPlugin();
		const config: UserConfig = {
			environments: {
				client: {
					build: {
						rolldownOptions: {},
					},
				},
			},
		};

		await callConfig(plugin, config, { command: 'build', mode: 'production' });

		expect(config.environments?.client?.build?.rolldownOptions?.input).toBe('src/root.tsx');
		expect(config.build?.rolldownOptions?.input).toBeUndefined();
	});

	test('generates a minimal router config from route files', async () => {
		const root = await tempProject();
		await mkdir(resolve(root, 'src/routes/about'), { recursive: true });
		await writeFile(resolve(root, 'src/routes/index.tsx'), 'export default {};');
		await writeFile(resolve(root, 'src/routes/index.md'), '# Home');
		await writeFile(resolve(root, 'src/routes/layout.tsx'), 'export default {};');
		await writeFile(resolve(root, 'src/routes/layout.docs.mdx'), 'export default {};');
		await writeFile(resolve(root, 'src/routes/about/index.tsx'), 'export default {};');
		await writeFile(resolve(root, 'src/routes/about/index.mdx'), 'export default {};');
		await writeFile(resolve(root, 'src/routes/about/index.markdown'), '# About');

		const plugin = getRouterPlugin();
		callConfigResolved(plugin, {
			base: '/',
			build: {},
			plugins: [],
			root,
		});

		const code = await callLoad(plugin, QWIK_ROUTER_CONFIG_ID, createViteHookContext('server'));

		expect(code).toContain('import "virtual:qwik-router-server-fns";');
		expect(code).toContain('import { createRoutes } from "@qwik-router-runtime";');
		expect(code).toContain('const routeModules = import.meta.glob(');
		expect(code).toContain('"/src/routes/**/index*.tsx"');
		expect(code).toContain('"/src/routes/**/index*.md"');
		expect(code).toContain('"/src/routes/**/index*.mdx"');
		expect(code).toContain('"/src/routes/**/index*.markdown"');
		expect(code).toContain('"/src/routes/**/layout*.tsx"');
		expect(code).toContain('"/src/routes/**/layout*.mdx"');
		expect(code).toContain(
			'export const routes = createRoutes(routeModules, false, "/src/routes");',
		);
		expect(code).not.toContain('function createRoutes(');
		expect(code).toContain(
			'export default { routes, serverPlugins, trailingSlash, basePathname, cacheModules };',
		);
	});

	test('leaves server manifest handling to the Qwik bundler', async () => {
		const root = await tempProject();
		await mkdir(resolve(root, 'src/routes'), { recursive: true });
		await writeFile(resolve(root, 'src/routes/index.tsx'), 'export default {};');

		const plugin = getRouterPlugin();
		callConfigResolved(plugin, {
			base: '/',
			build: {},
			plugins: [],
			root,
		});

		const code = await callLoad(plugin, QWIK_ROUTER_CONFIG_ID, {
			environment: { config: { consumer: 'server' }, mode: 'build' },
		});

		expect(code).not.toContain('q-manifest.json');
		expect(code).not.toContain('globalThis.__QWIK_MANIFEST__');
	});

	test('passes trailing slash configuration through to the generated router config', async () => {
		const root = await tempProject();
		await mkdir(resolve(root, 'src/routes'), { recursive: true });
		await writeFile(resolve(root, 'src/routes/index.tsx'), 'export default {};');

		const plugin = getRouterPlugin({ trailingSlash: false });
		callConfigResolved(plugin, {
			base: '/',
			build: {},
			plugins: [],
			root,
		});

		const code = await callLoad(plugin, QWIK_ROUTER_CONFIG_ID, createViteHookContext());

		expect(code).toContain('export const trailingSlash = false;');
	});

	test('configures preview middleware from the SSR preview output', async () => {
		const root = await tempProject();
		await mkdir(resolve(root, 'server'), { recursive: true });
		await writeFile(
			resolve(root, 'server/entry.preview.mjs'),
			'export default (_req, res) => res.end("preview ok");',
		);
		const middleware = { use: vi.fn() };

		await configureRouterPreviewServer({ middlewares: middleware } as never, root);

		expect(middleware.use).toHaveBeenCalledTimes(1);
		const handler = middleware.use.mock.calls[0]?.[0];
		const res = { end: vi.fn(), writeHead: vi.fn() };
		handler({}, res, vi.fn());
		expect(res.end).toHaveBeenCalledWith('preview ok');
	});

	test('aligns preview SSR builds with the preview middleware output directory', async () => {
		const plugin = getRouterPlugin();
		const config: UserConfig = {
			build: {
				ssr: 'src/entry.preview.tsx',
			},
		};

		await callConfig(plugin, config, { command: 'build', mode: 'production' });

		expect(config.build?.outDir).toBe('server');
	});

	test('does not replace a host-owned preview SSR output directory', async () => {
		const plugin = getRouterPlugin({ preview: { ssrOutDir: 'preview-server' } });
		const config: UserConfig = {
			build: {
				outDir: 'adapter-server',
				ssr: 'src/entry.preview.tsx',
			},
		};

		await callConfig(plugin, config, { command: 'build', mode: 'production' });

		expect(config.build?.outDir).toBe('adapter-server');
	});

	test('adds a router-owned preview environment for app builds', async () => {
		const plugin = getRouterPlugin();
		const config: UserConfig = {};

		await callConfig(plugin, config, { command: 'build', mode: 'production' });

		expect(config.environments?.preview).toMatchObject({
			consumer: 'server',
			resolve: {
				noExternal: expect.arrayContaining(['@qwik.dev/router', QWIK_ROUTER_CONFIG_ID]),
			},
			build: {
				outDir: 'server',
				rolldownOptions: {
					input: 'src/entry.preview.tsx',
				},
			},
		});
	});

	test('builds the router preview environment during app builds', async () => {
		const plugin = getRouterPlugin();
		const preview = { isBuilt: false, name: 'preview' };
		const build = vi.fn(async () => []);

		await callBuildApp(plugin, {
			environments: { preview },
			build,
		});

		expect(build).toHaveBeenCalledWith(preview);
	});

	test('eagerly imports router server function globs in server environments', async () => {
		const plugin = serverFunctionsPlugin({
			moduleGlobs: () => ['/src/routes/**/*.ts'],
		});

		const resolved = await callResolveId(plugin, QWIK_ROUTER_SERVER_FUNCTIONS_ID);
		const code = await callLoad(plugin, `\0${QWIK_ROUTER_SERVER_FUNCTIONS_ID}`, {
			environment: { config: { consumer: 'server' }, mode: 'build' },
		});

		expect(resolved).toEqual({
			id: `\0${QWIK_ROUTER_SERVER_FUNCTIONS_ID}`,
			moduleSideEffects: 'no-treeshake',
		});
		expect(code).toContain(
			'const modules0 = import.meta.glob("/src/routes/**/*.ts", { eager: true });',
		);
		expect(code).toContain('export default Object.assign({}, modules0);');
	});

	test('uses an empty router server function module outside server builds', async () => {
		const plugin = serverFunctionsPlugin({
			moduleGlobs: () => ['/src/routes/**/*.ts'],
		});

		const code = await callLoad(plugin, `\0${QWIK_ROUTER_SERVER_FUNCTIONS_ID}`, {
			environment: { config: { consumer: 'client' }, mode: 'build' },
		});

		expect(code).toBe('// No Qwik Router server functions');
	});

	test('does not statically import route modules for server function registration', async () => {
		const plugins = qwikRouter() as Plugin[];
		const router = getPlugin(plugins, 'vite-plugin-qwik-router');
		const serverFunctions = getPlugin(plugins, 'vite-plugin-qwik-router-server-functions');
		callConfigResolved(router, {
			base: '/',
			build: {},
			plugins: [],
			root: '/project',
		});

		const code = await callLoad(serverFunctions, `\0${QWIK_ROUTER_SERVER_FUNCTIONS_ID}`, {
			environment: { config: { consumer: 'server' }, mode: 'build' },
		});

		expect(code).not.toContain('/src/routes/**/index');
		expect(code).not.toContain('/src/routes/**/layout');
		expect(code).toContain('import.meta.glob("/src/**/*.server.ts", { eager: true });');
		expect(code).not.toContain('/src/routes/**/*.{js,jsx,ts,tsx,mdx}');
	});

	test('eagerly imports source server modules for navigation RPC registration', async () => {
		const plugins = qwikRouter() as Plugin[];
		const router = getPlugin(plugins, 'vite-plugin-qwik-router');
		const serverFunctions = getPlugin(plugins, 'vite-plugin-qwik-router-server-functions');
		callConfigResolved(router, {
			base: '/',
			build: {},
			plugins: [],
			root: '/project',
		});

		const code = await callLoad(serverFunctions, `\0${QWIK_ROUTER_SERVER_FUNCTIONS_ID}`, {
			environment: { config: { consumer: 'server' }, mode: 'serve' },
		});

		expect(code).toContain('import.meta.glob("/src/**/*.server.ts", { eager: true });');
		expect(code).toContain('import.meta.glob("/src/**/*.server.tsx", { eager: true });');
	});

	test('compiles MDX route modules through Satteri for Qwik JSX', async () => {
		const plugin = getRouterPlugin();
		callConfigResolved(plugin, {
			base: '/',
			build: {},
			plugins: [],
			root: '/project',
		});

		const result = await callTransform(
			plugin,
			`import { component$ } from '@qwik.dev/core';

export const Badge = component$(() => <strong>MDX badge</strong>);

# Hello MDX

<Badge />
`,
			'/project/src/routes/docs/index.mdx',
		);

		expect(result?.code).toContain('@qwik.dev/core/jsx-runtime');
		expect(result?.code).toContain('function MDXContent');
		expect(result?.code).toContain('Hello MDX');
		expect(result?.code).toContain('export default MDXContent');
	});

	test('compiles markdown route modules through Satteri for Qwik JSX', async () => {
		const plugin = getRouterPlugin();
		callConfigResolved(plugin, {
			base: '/',
			build: {},
			plugins: [],
			root: '/project',
		});

		const result = await callTransform(
			plugin,
			`# Hello Markdown
`,
			'/project/src/routes/docs/index.md',
		);

		expect(result?.code).toContain('@qwik.dev/core/jsx-runtime');
		expect(result?.code).toContain('function MDXContent');
		expect(result?.code).toContain('Hello Markdown');
		expect(result?.code).toContain('export default MDXContent');
	});

	test('exports MDX headings for route content metadata', async () => {
		const plugin = getRouterPlugin();
		callConfigResolved(plugin, {
			base: '/',
			build: {},
			plugins: [],
			root: '/project',
		});

		const result = await callTransform(
			plugin,
			`# Hello MDX

## Props

## Props
`,
			'/project/src/routes/docs/index.mdx',
		);

		expect(result?.code).toContain('id: "hello-mdx"');
		expect(result?.code).toContain('id: "props"');
		expect(result?.code).toContain('id: "props-1"');
		expect(result?.code).toContain(
			'export const headings = [{"text":"Hello MDX","id":"hello-mdx","level":1},{"text":"Props","id":"props","level":2},{"text":"Props","id":"props-1","level":2}];',
		);
	});

	test('passes provider imports to Satteri for MDX components', async () => {
		const plugin = getRouterPlugin({ mdx: { providerImportSource: '~/mdx/provider' } });
		callConfigResolved(plugin, {
			base: '/',
			build: {},
			plugins: [],
			root: '/project',
		});

		const result = await callTransform(
			plugin,
			'<Subtitle>MDX subtitle</Subtitle>',
			'/project/src/routes/docs/index.mdx',
		);

		expect(result?.code).toContain(
			'import { useMDXComponents as _provideComponents } from "~/mdx/provider";',
		);
		expect(result?.code).toContain('_provideComponents()');
	});

	test('configures a fetchable dev SSR environment', () => {
		const plugin = getRouterPlugin();
		const result = callConfigEnvironment(plugin, 'ssr', {});
		const worker = getRouterPlugin({ serverEnvironment: 'worker' });

		expect(result).toMatchObject({
			consumer: 'server',
			build: {
				rolldownOptions: {
					input: 'src/entry.ssr.tsx',
				},
			},
			resolve: {
				noExternal: expect.arrayContaining([
					'@qwik.dev/router',
					QWIK_ROUTER_CONFIG_ID,
					'zod',
				]),
			},
		});
		expect(result.dev?.createEnvironment).toEqual(expect.any(Function));
		expect(callConfigEnvironment(worker, 'ssr', {})).toEqual({});
		expect(callConfigEnvironment(worker, 'worker', {}).dev?.createEnvironment).toEqual(
			expect.any(Function),
		);
	});

	test('does not replace a host-owned SSR environment input', () => {
		const plugin = getRouterPlugin();

		expect(
			callConfigEnvironment(plugin, 'ssr', {
				build: {
					rolldownOptions: {
						input: 'src/adapter-entry.tsx',
					},
				},
			}),
		).toMatchObject({
			build: {
				rolldownOptions: {
					input: 'src/adapter-entry.tsx',
				},
			},
		});
	});

	test('does not replace a host-owned dev server environment', () => {
		const plugin = getRouterPlugin();
		const createEnvironment = vi.fn();
		const result = callConfigEnvironment(plugin, 'ssr', {
			dev: { createEnvironment },
		});

		expect(result.resolve?.noExternal).toContain('@qwik.dev/router');
		expect(result.dev?.createEnvironment).toBeUndefined();
	});

	test('static adapter computes SSG paths without Qwik Vite path getters', async () => {
		const root = await tempProject();
		const plugins = staticAdapter({ origin: 'qds.dev' }) as Plugin[];
		const adapter = getPlugin(plugins, 'vite-plugin-qwik-router-ssg-static-site-generation');
		const emitFile = vi.fn();
		const config = await callConfig(
			adapter,
			{ build: { ssr: true } },
			{ command: 'build', mode: 'production' },
		);

		expect(config).toMatchObject({ build: { outDir: 'server', ssr: true } });
		callConfigResolved(adapter, {
			command: 'build',
			root,
			build: { outDir: 'server', assetsDir: 'server-assets' },
			environments: {
				client: {
					build: { outDir: 'server', assetsDir: 'assets' },
				},
			},
			plugins: [
				{
					name: 'vite-plugin-qwik-router',
					api: {
						getBasePathname: () => '/docs/',
						getRoutes: () => [],
						getServiceWorkers: () => [],
					},
				},
				{ name: 'vite-plugin-qwik', api: { getManifest: () => null } },
			],
		});

		const code = callLoad(
			adapter,
			'\0@qwik-ssg-entry',
			createViteHookContext('server'),
		) as string;

		expect(callResolveId(adapter, '@qwik-ssg-entry')).toBe('\0@qwik-ssg-entry');
		expect(code).toContain(
			`import render from ${JSON.stringify(resolve(root, 'src/entry.ssr'))};`,
		);
		expect(code).toContain(
			`import manifest from ${JSON.stringify(resolve(root, 'dist/q-manifest.json'))};`,
		);
		expect(code).toContain('globalThis.__QWIK_MANIFEST__ = manifest;');
		expect(code).toContain(`"outDir":${JSON.stringify(resolve(root, 'dist'))}`);
		callBuildStart(
			adapter,
			{ cwd: root },
			{
				...createViteHookContext('server', {}),
				emitFile,
			},
		);
		expect(emitFile).toHaveBeenCalledWith({
			id: '@qwik-ssg-entry',
			type: 'chunk',
			fileName: 'run-ssg.js',
		});
	});

	test('static adapter builds environments and delegates generation', async () => {
		const root = await tempProject();
		const serverChunk = 'assets/server.js';
		const generate = vi.fn();
		const warn = vi.fn();
		const plugins = staticAdapter({
			generate,
			origin: 'qds.dev',
			ssg: null,
		}) as Plugin[];
		const adapter = getPlugin(plugins, 'vite-plugin-qwik-router-ssg-static-site-generation');

		callConfigResolved(adapter, {
			command: 'build',
			root,
			build: { outDir: 'server' },
			environments: {
				client: {
					build: { outDir: 'dist', assetsDir: 'assets' },
				},
			},
			plugins: [
				{
					name: 'vite-plugin-qwik-router',
					api: {
						getBasePathname: () => '/docs/',
						getRoutes: () => [],
						getServiceWorkers: () => [],
					},
				},
			],
		});
		await callGenerateBundle(
			adapter,
			{
				[serverChunk]: {
					type: 'chunk',
					fileName: serverChunk,
					isEntry: true,
					code: '',
				},
			},
			vi.fn(),
			createViteHookContext('server'),
		);

		const clientEnvironment = { isBuilt: false, name: 'client' };
		const serverEnvironment = { isBuilt: false, name: 'ssr' };
		const build = vi.fn(async (environment: typeof clientEnvironment) => {
			environment.isBuilt = true;
		});
		await callBuildApp(
			adapter,
			{
				build,
				config: {},
				environments: {
					client: clientEnvironment,
					ssr: serverEnvironment,
				},
			},
			{ warn },
		);

		expect(build).toHaveBeenCalledWith(clientEnvironment);
		expect(build).toHaveBeenCalledWith(serverEnvironment);
		expect(generate).toHaveBeenCalledWith(
			expect.objectContaining({
				outputEntries: [serverChunk],
				clientOutDir: resolve(root, 'dist'),
				serverOutDir: resolve(root, 'server'),
			}),
		);
		expect(warn).toHaveBeenCalledOnce();
	});

	test('dispatches dev SSR through a fetchable server environment', async () => {
		const plugin = getRouterPlugin();
		await callConfig(plugin, {}, { command: 'serve', mode: 'development' });
		callConfigResolved(plugin, {
			base: '/',
			build: {},
			plugins: [],
			root: '/app',
		});

		const dispatchFetch = vi.fn(
			async () =>
				new Response(
					'<html><head><title>App</title><script type="module">const u="/x";import(u)</script></head><body>ok</body></html>',
					{
						headers: { 'content-type': 'text/html; charset=utf-8' },
					},
				),
		);
		const server = createMockDevServer({
			ssr: createMockEnvironment({ consumer: 'server', dispatchFetch }),
		});
		server.transformIndexHtml.mockImplementation(async (_url, html: string) => {
			expect(html).not.toContain('import(u)');
			return html.replace(
				'<head>',
				'<head><script type="module" src="/@vite/client"></script>',
			);
		});

		const install = callConfigureServer(plugin, server) as () => void;
		install();

		const middleware = server.middlewares.use.mock.calls[0]?.[0];
		const req = createMockRequest('/');
		const res = createMockResponse();
		await middleware(req, res, vi.fn());

		expect(dispatchFetch).toHaveBeenCalledWith(expect.any(Request));
		expect(server.transformIndexHtml).toHaveBeenCalledWith(
			'/',
			'<html><head></head><body></body></html>',
		);
		expect(res.body).toContain('<script type="module" src="/@vite/client"></script>');
		expect(res.body).toContain('<title>App</title>');
		expect(res.body).toContain('import(u)');
	});

	test('does not fall back to a runnable server environment', async () => {
		const plugin = getRouterPlugin({
			serverEnvironment: 'worker',
			platform: {
				env: {
					get: (key: string) =>
						key === 'PUBLIC_API_URL' ? 'https://api.local' : undefined,
				},
			},
		});
		await callConfig(plugin, {}, { command: 'serve', mode: 'development' });
		callConfigResolved(plugin, {
			base: '/',
			build: {},
			plugins: [],
			root: '/app',
		});

		const runnerImport = vi.fn(async (id: string) => {
			throw new Error(`Unexpected import: ${id}`);
		});
		const dispatchFetch = vi.fn(async () => new Response('default ssr'));
		const server = createMockDevServer({
			ssr: createMockEnvironment({ consumer: 'server', dispatchFetch, runnerImport }),
		});

		const install = callConfigureServer(plugin, server) as () => void;
		install();

		const middleware = server.middlewares.use.mock.calls[0]?.[0];
		const req = createMockRequest('/');
		const res = createMockResponse();
		const next = vi.fn();
		await middleware(req, res, next);

		expect(dispatchFetch).not.toHaveBeenCalled();
		expect(runnerImport).not.toHaveBeenCalled();
		expect(next).toHaveBeenCalledTimes(1);
		expect(res.body).toBe('');
	});

	test('collects dev CSS links from environment graphs in import order', async () => {
		const plugin = getRouterPlugin();
		await callConfig(plugin, {}, { command: 'serve', mode: 'development' });
		callConfigResolved(plugin, {
			base: '/',
			build: {},
			plugins: [],
			root: '/app',
		});

		const root = createModule('/src/root.tsx');
		const component = createModule('/src/components/button.tsx');
		const globalCss = createModule('/src/styles/global.css', 'css', 10);
		const componentCss = createModule('/src/components/button.css', 'css', 20);
		const resetCss = createModule('/src/styles/reset.css', 'css', 30);
		linkModules(root, globalCss);
		linkModules(root, component);
		linkModules(globalCss, resetCss);
		linkModules(component, componentCss);

		const server = createMockDevServer({
			ssr: createMockEnvironment({
				consumer: 'server',
				modules: [root, globalCss, component, componentCss, resetCss],
			}),
		});
		callConfigureServer(plugin, server);

		const tags = callTransformIndexHtml(plugin, '') as HtmlTag[];

		expect(tags.map((tag) => tag.attrs.href)).toEqual([
			'/src/styles/global.css?t=10',
			'/src/components/button.css?t=20',
		]);
	});
});

function getRouterPlugin(options?: Parameters<typeof qwikRouter>[0]) {
	return getPlugin(qwikRouter(options) as Plugin[], 'vite-plugin-qwik-router');
}

function tempProject() {
	return mkdtemp(join(tmpdir(), 'qwik-router-plugin-'));
}

function createMockDevServer(environments: Record<string, MockEnvironment>) {
	return {
		config: { base: '/' },
		environments,
		middlewares: { use: vi.fn() },
		ssrFixStacktrace: vi.fn(),
		transformIndexHtml: vi.fn(async (_url: string, html: string) => html),
		watcher: { add: vi.fn(), on: vi.fn() },
	};
}

function createMockEnvironment(options: {
	consumer: 'client' | 'server';
	dispatchFetch?: (request: Request) => Promise<Response> | Response;
	modules?: MockModule[];
	runnerImport?: (id: string) => Promise<unknown>;
}): MockEnvironment {
	const idToModuleMap = new Map<string, MockModule>();
	for (const mod of options.modules ?? []) {
		if (mod.id) {
			idToModuleMap.set(mod.id, mod);
		}
	}
	return {
		config: { consumer: options.consumer },
		dispatchFetch: options.dispatchFetch,
		moduleGraph: { idToModuleMap },
		runner: options.runnerImport ? { import: options.runnerImport } : undefined,
	};
}

function createModule(url: string, type: 'js' | 'css' = 'js', lastHMRTimestamp = 0): MockModule {
	return {
		file: url,
		id: url,
		importedModules: new Set(),
		importers: new Set(),
		lastHMRTimestamp,
		type,
		url,
	};
}

function linkModules(importer: MockModule, imported: MockModule) {
	importer.importedModules.add(imported);
	imported.importers.add(importer);
}

function createMockRequest(url: string) {
	return {
		headers: { accept: 'text/html', host: 'localhost:5173' },
		method: 'GET',
		url,
	};
}

function createMockResponse() {
	return {
		body: '',
		headers: new Map<string, unknown>(),
		statusCode: 200,
		end(value?: unknown) {
			this.body +=
				value instanceof Uint8Array ? new TextDecoder().decode(value) : String(value ?? '');
		},
		getHeader(name: string) {
			return this.headers.get(name.toLowerCase());
		},
		removeHeader: vi.fn(),
		setHeader(name: string, value: unknown) {
			this.headers.set(name.toLowerCase(), value);
		},
	};
}

type MockEnvironment = {
	config: { consumer: 'client' | 'server' };
	dispatchFetch?: (request: Request) => Promise<Response> | Response;
	moduleGraph: { idToModuleMap: Map<string, MockModule> };
	runner?: { import: (id: string) => Promise<unknown> };
};

type MockModule = {
	file: string;
	id: string;
	importedModules: Set<MockModule>;
	importers: Set<MockModule>;
	lastHMRTimestamp: number;
	type: 'js' | 'css';
	url: string;
};

type HtmlTag = {
	attrs: { href: string };
};
