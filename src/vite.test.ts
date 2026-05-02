import { createOptimizer } from '@qwik.dev/optimizer';
import type { Plugin, ResolvedConfig, UserConfig } from 'vite';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { QwikManifest } from './q-manifest';
import { qwik } from './vite';

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

describe('Vite plugin', () => {
	test('exposes the Vite plugin identity expected by Qwik Router', () => {
		const plugin = getQwikPlugin() as Plugin & {
			api?: {
				getManifest?: () => QwikManifest | null;
			};
		};

		expect(plugin.name).toBe('vite-plugin-qwik');
		expect(plugin.api?.getManifest?.()).toBe(null);
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
			'export default 1;',
			'/workspace/app/src/root.tsx',
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

	test('sets Vite config defaults for app builds', () => {
		const plugin = getQwikPlugin();
		const config: UserConfig = {
			build: {
				rolldownOptions: {
					external: ['external-dependency'],
				},
			},
		};

		callConfig(plugin, config, { command: 'build', mode: 'production' });

		expect(config.build!.rolldownOptions).toMatchObject({
			external: ['external-dependency'],
			output: {
				entryFileNames: 'build/q-[hash].js',
				chunkFileNames: 'build/q-[hash].js',
				hoistTransitiveImports: false,
			},
		});
		expect(config.build!.modulePreload).toBe(false);
	});

	test('dispatches output defaults by Vite environment context', () => {
		const plugin = getQwikPlugin();
		const clientOutput = callOutputOptions(plugin, { dir: 'dist' }) as {
			codeSplitting?: { groups?: Array<{ name: string }> };
		};

		expect(clientOutput).toMatchObject({
			dir: 'dist',
			entryFileNames: 'build/q-[hash].js',
			chunkFileNames: 'build/q-[hash].js',
			hoistTransitiveImports: false,
		});
		expect(clientOutput.codeSplitting?.groups?.map((group) => group.name)).toEqual([
			'qwik-core',
			'qwik-loader',
			'qwik-preloader',
		]);
		expect(callOutputOptions(plugin, { dir: 'server' }, { consumer: 'server' })).toEqual({
			dir: 'server',
			chunkFileNames: 'q-[hash].js',
			hoistTransitiveImports: false,
		});
		expect(
			callOutputOptions(plugin, { entryFileNames: '[name].js' }, { build: { lib: true } }),
		).toEqual({
			entryFileNames: '[name].js',
		});
	});

	test('keeps Vite library config output under host control', () => {
		const plugin = getQwikPlugin();
		const config: UserConfig = {
			build: {
				lib: { entry: 'src/index.tsx' },
				rolldownOptions: {},
			},
		};

		callConfig(plugin, config, { command: 'build', mode: 'production' });

		expect(config.build!.rolldownOptions!.output).toBeUndefined();
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
		await callTransform(plugin, 'export default 1;', '/workspace/app/src/root.tsx', {
			consumer: 'server',
		});

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				isServer: true,
				mode: 'prod',
				entryStrategy: { type: 'hoist' },
			}),
		);
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
		await callTransform(plugin, 'export default 1;', '/workspace/app/src/root.tsx', {
			build: { lib: { entry: 'src/index.tsx' } },
		});

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: 'lib',
				entryStrategy: { type: 'inline' },
			}),
		);
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
		await callTransform(plugin, 'source', '/workspace/app/src/root.tsx');

		const resolvedId = await callResolveId(
			plugin,
			'./root.tsx_root_component_abc.js',
			'/workspace/app/src/root.tsx',
		);

		expect(typeof resolvedId).toBe('string');
		expect(await callLoad(plugin, resolvedId as string)).toBe(
			'export const s_abc = () => "Hello";',
		);

		const resolve = vi.fn().mockResolvedValue({ id: '/workspace/app/src/home.tsx' });
		expect(await callResolveId(plugin, './home', resolvedId as string, resolve)).toEqual({
			id: '/workspace/app/src/home.tsx',
		});
		expect(resolve).toHaveBeenCalledWith('./home', '/workspace/app/src/root.tsx', {
			skipSelf: true,
		});
	});

	test('injects and serves the Vite HMR bridge in dev', async () => {
		const plugins = getVitePlugins();
		const plugin = getPlugin(plugins, 'vite-plugin-qwik');
		const hmrPlugin = getPlugin(plugins, 'vite-plugin-qwik-hmr');

		callConfigResolved(plugin, {
			command: 'serve',
			root: '/workspace/app',
			build: {
				rolldownOptions: {},
				rollupOptions: {},
			},
		});

		expect(callTransformIndexHtml(hmrPlugin)).toEqual([
			expect.objectContaining({
				tag: 'script',
				children: expect.stringContaining('@qwik-hmr-bridge'),
			}),
		]);
		expect(await callResolveId(hmrPlugin, '@qwik-hmr-bridge')).toBe('\0@qwik-hmr-bridge');
		expect(await callLoad(hmrPlugin, '\0@qwik-hmr-bridge')).toContain('qwik:hmr');
	});

	test('forwards SSR module updates to the client HMR bridge', () => {
		const plugin = getPlugin(getVitePlugins(), 'vite-plugin-qwik-hmr');
		const send = vi.fn();

		callHotUpdate(
			plugin,
			{
				environment: { config: { consumer: 'server' } },
			},
			{
				modules: [{ url: '/src/root.tsx?v=123', importers: new Set(), type: 'js' }],
				server: {
					environments: {
						client: {
							hot: { send },
						},
					},
				},
				timestamp: 123,
			},
		);

		expect(send).toHaveBeenCalledWith({
			type: 'custom',
			event: 'qwik:hmr',
			data: { files: ['/src/root.tsx'], t: 123 },
		});
	});
});

function getVitePlugins() {
	return qwik() as Plugin[];
}

function getQwikPlugin() {
	return getPlugin(getVitePlugins(), 'vite-plugin-qwik');
}

function getPlugin(plugins: Plugin[], name: string) {
	const plugin = plugins.find((item) => item.name === name);
	if (!plugin) {
		throw new Error(`Expected ${name} plugin`);
	}
	return plugin;
}

function callConfig(
	plugin: Plugin,
	config: unknown,
	env: { command: 'build' | 'serve'; mode: string },
) {
	const configHook = plugin.config;
	if (typeof configHook === 'function') {
		return configHook.call({} as never, config as never, env as never);
	}
	throw new Error('Expected function config hook');
}

function callConfigResolved(plugin: Plugin, config: unknown) {
	const configResolved = plugin.configResolved;
	if (typeof configResolved === 'function') {
		return configResolved.call({} as never, config as ResolvedConfig);
	}
	throw new Error('Expected function configResolved hook');
}

function callOutputOptions(
	plugin: Plugin,
	outputOptions: unknown,
	options: {
		consumer?: 'client' | 'server';
		build?: { lib?: unknown };
	} = {},
) {
	const outputOptionsHook = plugin.outputOptions;
	const { consumer = 'client', build = {} } = options;
	const context = createHookContext(consumer, build);
	if (typeof outputOptionsHook === 'function') {
		return outputOptionsHook.call(context as never, outputOptions as never);
	}
	throw new Error('Expected function outputOptions hook');
}

async function callTransform(
	plugin: Plugin,
	code: string,
	id: string,
	options: {
		consumer?: 'client' | 'server';
		build?: { lib?: unknown };
	} = {},
) {
	const transform = plugin.transform;
	const { consumer = 'client', build = {} } = options;
	const context = createHookContext(consumer, build);
	if (typeof transform === 'function') {
		return transform.call(context as never, code, id, undefined as never);
	}
	throw new Error('Expected function transform hook');
}

function callTransformIndexHtml(plugin: Plugin) {
	const transformIndexHtml = plugin.transformIndexHtml;
	if (typeof transformIndexHtml === 'function') {
		return transformIndexHtml.call({} as never, '', {} as never);
	}
	throw new Error('Expected function transformIndexHtml hook');
}

async function callResolveId(plugin: Plugin, id: string, importer?: string, resolve = vi.fn()) {
	const resolveId = plugin.resolveId;
	const context = createHookContext('client', {});
	context.resolve = resolve;
	if (typeof resolveId === 'function') {
		return resolveId.call(context as never, id, importer, { isEntry: false } as never);
	}
	throw new Error('Expected function resolveId hook');
}

async function callLoad(plugin: Plugin, id: string) {
	const load = plugin.load;
	const context = createHookContext('client', {});
	if (typeof load === 'function') {
		return load.call(context as never, id, undefined as never);
	}
	throw new Error('Expected function load hook');
}

function callHotUpdate(plugin: Plugin, context: unknown, options: unknown) {
	const hotUpdate = plugin.hotUpdate;
	if (typeof hotUpdate === 'function') {
		return hotUpdate.call(context as never, options as never);
	}
	throw new Error('Expected function hotUpdate hook');
}

function createHookContext(consumer: 'client' | 'server', build: { lib?: unknown }) {
	return {
		environment: { config: { consumer, build } },
		emitFile: vi.fn(),
		resolve: vi.fn(),
	};
}
