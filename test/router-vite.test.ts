import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import type { Plugin, UserConfig } from 'vite';
import { describe, expect, test, vi } from 'vitest';
import {
	QWIK_ROUTER_CONFIG_ID,
	collectServerFunctionModuleIds,
	configureRouterPreviewServer,
	qwikRouter,
} from '../router/vite/index.ts';
import {
	callConfig,
	callConfigResolved,
	callLoad,
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

	test('collects modules that contain server function registrations from graph roots', async () => {
		const resolvedVirtualId = '\0virtual:qwik-router-server-fns';
		const modules = new Map([
			[
				'/app/routes/index.tsx',
				{
					id: '/app/routes/index.tsx',
					code: 'export default {};',
					importedIds: ['/app/shared.ts'],
					dynamicallyImportedIds: ['/app/lazy.ts'],
				},
			],
			[
				'/app/shared.ts',
				{
					id: '/app/shared.ts',
					code: 'import "virtual:qwik-router-server-fns";',
					importedIds: [resolvedVirtualId],
					dynamicallyImportedIds: [],
				},
			],
			[
				'/app/lazy.ts',
				{
					id: '/app/lazy.ts',
					code: 'export const action = serverQrl(() => null);',
					importedIds: [],
					dynamicallyImportedIds: [],
				},
			],
		]);
		const context = {
			resolve: async (id: string) => ({ id, external: false }),
			load: async ({ id }: { id: string }) => modules.get(id),
		};

		const result = await collectServerFunctionModuleIds(
			{ entries: ['/app/routes/index.tsx'], resolvedVirtualId },
			context as never,
		);

		expect(result).toEqual(['/app/lazy.ts']);
	});
});

function getRouterPlugin(options?: Parameters<typeof qwikRouter>[0]) {
	return getPlugin(qwikRouter(options) as Plugin[], 'vite-plugin-qwik-router');
}

function tempProject() {
	return mkdtemp(join(tmpdir(), 'qwik-router-plugin-'));
}
