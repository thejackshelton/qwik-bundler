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
import {
	callConfig,
	callConfigEnvironment,
	callConfigResolved,
	callConfigureServer,
	callLoad,
	callResolveId,
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
		await writeFile(resolve(root, 'src/routes/layout.tsx'), 'export default {};');
		await writeFile(resolve(root, 'src/routes/about/index.tsx'), 'export default {};');

		const plugin = getRouterPlugin();
		callConfigResolved(plugin, {
			base: '/',
			build: {},
			plugins: [],
			root,
		});

		const code = await callLoad(plugin, QWIK_ROUTER_CONFIG_ID, createViteHookContext('server'));

		expect(code).toContain('import "virtual:qwik-router-server-fns";');
		expect(code).toContain('const routeModules = import.meta.glob(');
		expect(code).toContain('"/src/routes/**/index*.tsx"');
		expect(code).toContain('"/src/routes/**/layout*.tsx"');
		expect(code).toContain(
			'export const routes = createRoutes(routeModules, false, "/src/routes");',
		);
		expect(code).toContain(
			'export default { routes, serverPlugins, trailingSlash, basePathname, cacheModules };',
		);
	});

	test('seeds the client manifest during server builds', async () => {
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

		expect(code).toContain('import manifest from "/dist/q-manifest.json";');
		expect(code).toContain('globalThis.__QWIK_MANIFEST__ = manifest;');
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

	test('configures a fetchable dev SSR environment', () => {
		const plugin = getRouterPlugin();
		const result = callConfigEnvironment(plugin, 'ssr', {});
		const worker = getRouterPlugin({ serverEnvironment: 'worker' });

		expect(result).toMatchObject({
			consumer: 'server',
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

	test('does not replace a host-owned dev server environment', () => {
		const plugin = getRouterPlugin();
		const createEnvironment = vi.fn();
		const result = callConfigEnvironment(plugin, 'ssr', {
			dev: { createEnvironment },
		});

		expect(result.resolve?.noExternal).toContain('@qwik.dev/router');
		expect(result.dev?.createEnvironment).toBeUndefined();
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
