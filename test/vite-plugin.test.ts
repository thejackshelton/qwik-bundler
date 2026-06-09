import { createOptimizer } from '@qwik.dev/optimizer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { QWIK_MANIFEST } from '../src/build/manifest';
import type { QwikManifest } from '../src/types';
import { qwik } from '../src/vite/index';
import {
	callConfigResolved,
	callLoad,
	callResolveId,
	callTransform,
	createViteHookContext,
	getPlugin,
} from './helpers';

const optimizerMock = vi.hoisted(() => ({
	createOptimizer: vi.fn(),
	transformModules: vi.fn(),
}));

vi.mock('@qwik.dev/optimizer', () => ({
	createOptimizer: optimizerMock.createOptimizer,
}));

beforeEach(() => {
	optimizerMock.createOptimizer.mockReset();
	optimizerMock.transformModules.mockReset();
	optimizerMock.transformModules.mockResolvedValue({
		modules: [
			{
				path: './src/root.tsx',
				isEntry: false,
				code: 'optimized',
				map: null,
				segment: null,
				origPath: null,
			},
		],
		diagnostics: [],
		isTypeScript: true,
		isJsx: true,
	});
	optimizerMock.createOptimizer.mockResolvedValue({
		transformModules: optimizerMock.transformModules,
		sys: {} as never,
	});
});

describe('Vite plugin hooks', () => {
	test('exposes the Vite plugin identity expected by Qwik Router', () => {
		const plugin = getQwikPlugin() as ReturnType<typeof getQwikPlugin> & {
			api?: {
				getManifest?: () => QwikManifest | null;
				registerBundleGraphAdder?: (adder: () => Record<string, never>) => void;
				registerPreloadGraphEntries?: (adder: () => Record<string, never>) => void;
				registerOptimizerStripNames?: (names: unknown) => void;
			};
		};

		expect(plugin.name).toBe('vite-plugin-qwik');
		expect(plugin.api?.getManifest?.()).toBe(null);
		expect(plugin.api?.registerBundleGraphAdder).toEqual(expect.any(Function));
		expect(plugin.api?.registerPreloadGraphEntries).toEqual(expect.any(Function));
		expect(plugin.api?.registerOptimizerStripNames).toEqual(expect.any(Function));
	});

	test('does not force the optimizer transform ahead of earlier Vite transforms', () => {
		const plugin = getQwikPlugin();
		const transform = plugin.transform as { order?: string };

		expect(transform.order).toBeUndefined();
	});

	test('serves the Qwik client manifest virtual module required by current Qwik core dev SSR', async () => {
		const plugin = getQwikPlugin();

		callConfigResolved(plugin, {
			command: 'serve',
			root: '/workspace/app',
			build: {
				rolldownOptions: { input: 'src/root.tsx' },
				rollupOptions: {},
			},
		});

		expect(
			await callResolveId(
				plugin,
				'@qwik-client-manifest',
				'/workspace/app/node_modules/@qwik.dev/core/dist/server.mjs',
				createViteHookContext('server'),
			),
		).toBe('@qwik-client-manifest');
		expect(
			await callLoad(plugin, '@qwik-client-manifest', createViteHookContext('server')),
		).toBe('export const manifest = undefined;');
	});

	test('uses Vite config root for optimizer paths', async () => {
		const plugin = getQwikPlugin();

		callConfigResolved(plugin, {
			root: '/workspace/app',
			build: {
				rolldownOptions: { input: 'src/root.tsx' },
				rollupOptions: {},
			},
		});
		const result = await callTransform(
			plugin,
			"import { component$ } from '@qwik.dev/core'; export default 1;",
			'/workspace/app/src/root.tsx',
			createViteHookContext(),
		);

		expect(createOptimizer).toHaveBeenCalledWith(undefined);
		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				rootDir: '/workspace/app',
				srcDir: '/workspace/app',
				isServer: false,
			}),
		);
		expect(result).toEqual({ code: 'optimized', map: null });
	});

	test('uses Vite SSR transform context for server transforms', async () => {
		const plugin = getQwikPlugin();

		callConfigResolved(plugin, {
			root: '/workspace/app',
			build: {
				rolldownOptions: { input: 'src/root.tsx' },
				rollupOptions: {},
			},
		});
		await callTransform(
			plugin,
			"import { renderToString } from '@qwik.dev/core/server'; export default 1;",
			'/workspace/app/src/root.tsx',
			createViteHookContext('server'),
		);

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				isServer: true,
				mode: 'prod',
				entryStrategy: { type: 'hoist' },
			}),
		);
		expectTransformModulesNeverCalledWithHmr();
	});

	test('lets framework plugins register optimizer strip names', async () => {
		const plugin = getQwikPlugin() as ReturnType<typeof getQwikPlugin> & {
			api?: {
				registerOptimizerStripNames?: (names: {
					client?: { ctxName?: string[]; exports?: string[] };
				}) => void;
			};
		};

		plugin.api?.registerOptimizerStripNames?.({
			client: {
				ctxName: ['route', 'loader$'],
				exports: ['onGet', 'loader'],
			},
		});
		callConfigResolved(plugin, {
			root: '/workspace/app',
			build: {
				rolldownOptions: { input: 'src/root.tsx' },
				rollupOptions: {},
			},
		});
		await callTransform(
			plugin,
			"import { component$ } from '@qwik.dev/core'; export const loader = () => null;",
			'/workspace/app/src/routes/index.tsx',
			createViteHookContext(),
		);

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				stripCtxName: expect.arrayContaining(['route', 'server', 'loader$']),
				stripExports: expect.arrayContaining(['onGet', 'loader']),
			}),
		);
	});

	test('GATE-04 uses production optimizer mode for Vite client builds', async () => {
		const plugin = getQwikPlugin();

		callConfigResolved(plugin, {
			command: 'build',
			root: '/workspace/app',
			build: {
				rolldownOptions: { input: 'src/root.tsx' },
				rollupOptions: {},
			},
		});
		await callTransform(
			plugin,
			"import { component$ } from '@qwik.dev/core'; export default 1;",
			'/workspace/app/src/root.tsx',
			createViteHookContext(),
		);

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				isServer: false,
				mode: 'prod',
			}),
		);
		expectTransformModulesNeverCalledWithHmr();
	});

	test('uses Vite library context for Qwik library transforms', async () => {
		const plugin = getQwikPlugin();

		callConfigResolved(plugin, {
			root: '/workspace/app',
			build: {
				rolldownOptions: { input: 'src/root.tsx' },
				rollupOptions: {},
			},
		});
		await callTransform(
			plugin,
			"import { component$ } from '@qwik.dev/core'; export default 1;",
			'/workspace/app/src/root.tsx',
			createViteHookContext('client', { lib: { entry: 'src/index.tsx' } }),
		);

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: 'lib',
				entryStrategy: { type: 'inline' },
			}),
		);
		expectTransformModulesNeverCalledWithHmr();
	});

	test('resolves and loads QRL segment modules emitted by the optimizer', async () => {
		optimizerMock.transformModules.mockResolvedValueOnce({
			modules: [
				{
					path: '/workspace/app/src/root.tsx',
					isEntry: false,
					code: 'import { qrl } from "@qwik.dev/core"; qrl(() => import("./root.tsx_root_component_abc.js"), "s_abc");',
					map: null,
					segment: null,
					origPath: null,
				},
				{
					path: '/workspace/app/src/root.tsx_root_component_abc.js',
					isEntry: false,
					code: 'export const s_abc = () => "Hello";',
					map: null,
					segment: {
						origin: '/workspace/app/src/root.tsx',
						name: 's_abc',
						entry: null,
						displayName: 'root.tsx_root_component',
						hash: 'abc',
						canonicalFilename: 'root.tsx_root_component_abc',
						extension: 'js',
						parent: null,
						ctxKind: 'function',
						ctxName: 'component',
						captures: false,
						loc: [0, 0],
					},
					origPath: null,
				},
			],
			diagnostics: [],
			isTypeScript: true,
			isJsx: true,
		});

		const plugin = getQwikPlugin();
		callConfigResolved(plugin, {
			root: '/workspace/app',
			build: {
				rolldownOptions: { input: 'src/root.tsx' },
				rollupOptions: {},
			},
		});
		await callTransform(
			plugin,
			"import { component$ } from '@qwik.dev/core';",
			'/workspace/app/src/root.tsx',
			createViteHookContext(),
		);

		const resolvedId = await callResolveId(
			plugin,
			'./root.tsx_root_component_abc.js',
			'/workspace/app/src/root.tsx',
			createViteHookContext(),
		);

		expect(typeof resolvedId).toBe('string');
		expect(await callLoad(plugin, resolvedId as string, createViteHookContext())).toBe(
			'export const s_abc = () => "Hello";',
		);

		const resolve = vi.fn().mockResolvedValue({ id: '/workspace/app/src/home.tsx' });
		expect(
			await callResolveId(plugin, './home', resolvedId as string, {
				...createViteHookContext(),
				resolve,
			}),
		).toEqual({
			id: '/workspace/app/src/home.tsx',
		});
		expect(resolve).toHaveBeenCalledWith('./home', '/workspace/app/src/root.tsx', {
			skipSelf: true,
		});
	});

	test('injects Vite dev tags through the dev server manifest', async () => {
		const plugin = getQwikPlugin();

		callConfigResolved(plugin, {
			base: '/',
			command: 'serve',
			root: '/workspace/app',
			build: { rolldownOptions: {}, rollupOptions: {} },
		});

		const result = await callTransform(
			plugin,
			`export const manifest = ${QWIK_MANIFEST};`,
			'/workspace/app/node_modules/@qwik.dev/core/dist/core.mjs',
			createViteHookContext('server'),
		);
		if (!result || typeof result === 'string' || !('code' in result)) {
			throw new Error('Expected transformed code');
		}

		expect(result.code).toContain('"manifestHash":"dev"');
		expect(result.code).toContain('"src":"/@vite/client"');
		expect(result.code).toContain('"src":"/@id/virtual:qwik-hmr-bridge"');
	});

	test('prefixes dev tag urls with the Vite base', async () => {
		const plugin = getQwikPlugin();

		callConfigResolved(plugin, {
			base: '/docs/',
			command: 'serve',
			root: '/workspace/app',
			build: { rolldownOptions: {}, rollupOptions: {} },
		});

		const result = await callTransform(
			plugin,
			`export const manifest = ${QWIK_MANIFEST};`,
			'/workspace/app/node_modules/@qwik.dev/core/dist/core.mjs',
			createViteHookContext('server'),
		);
		if (!result || typeof result === 'string' || !('code' in result)) {
			throw new Error('Expected transformed code');
		}

		expect(result.code).toContain('"src":"/docs/@vite/client"');
		expect(result.code).toContain('"src":"/docs/@id/virtual:qwik-hmr-bridge"');
	});

	test('omits the HMR bridge dev tag when HMR is disabled', async () => {
		const plugin = getPlugin(qwik({ hmr: false }), 'vite-plugin-qwik');

		callConfigResolved(plugin, {
			base: '/',
			command: 'serve',
			root: '/workspace/app',
			build: { rolldownOptions: {}, rollupOptions: {} },
		});

		const result = await callTransform(
			plugin,
			`export const manifest = ${QWIK_MANIFEST};`,
			'/workspace/app/node_modules/@qwik.dev/core/dist/core.mjs',
			createViteHookContext('server'),
		);
		if (!result || typeof result === 'string' || !('code' in result)) {
			throw new Error('Expected transformed code');
		}

		expect(result.code).toContain('"src":"/@vite/client"');
		expect(result.code).not.toContain('virtual:qwik-hmr-bridge');
	});

	test('renders dev injections registered through the plugin api', async () => {
		const plugin = getQwikPlugin();

		callConfigResolved(plugin, {
			base: '/',
			command: 'serve',
			root: '/workspace/app',
			build: { rolldownOptions: {}, rollupOptions: {} },
		});
		plugin.api?.registerDevInjection?.({
			tag: 'link',
			location: 'head',
			attributes: { rel: 'stylesheet', href: '/@qwik-router/dev-styles.css' },
		});

		const result = await callTransform(
			plugin,
			`export const manifest = ${QWIK_MANIFEST};`,
			'/workspace/app/node_modules/@qwik.dev/core/dist/core.mjs',
			createViteHookContext('server'),
		);
		if (!result || typeof result === 'string' || !('code' in result)) {
			throw new Error('Expected transformed code');
		}

		expect(result.code).toContain('"href":"/@qwik-router/dev-styles.css"');
	});

	test('does not inject dev tags for build transforms', async () => {
		const plugin = getQwikPlugin();

		callConfigResolved(plugin, {
			base: '/',
			command: 'build',
			root: '/workspace/app',
			build: { rolldownOptions: {}, rollupOptions: {} },
		});

		const result = await callTransform(
			plugin,
			`export const manifest = ${QWIK_MANIFEST};`,
			'/workspace/app/node_modules/@qwik.dev/core/dist/core.mjs',
			createViteHookContext('server'),
		);
		if (!result || typeof result === 'string' || !('code' in result)) {
			throw new Error('Expected transformed code');
		}

		expect(result.code).toContain(QWIK_MANIFEST);
	});
});

function getQwikPlugin() {
	return getPlugin(qwik() as Plugin[], 'vite-plugin-qwik');
}

function expectTransformModulesNeverCalledWithHmr() {
	for (const [options] of optimizerMock.transformModules.mock.calls) {
		expect(options).not.toEqual(expect.objectContaining({ mode: 'hmr' }));
	}
}
