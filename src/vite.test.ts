import { createOptimizer } from '@qwik.dev/optimizer';
import type { EnvironmentOptions, Plugin, ResolvedConfig, UserConfig } from 'vite';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { QwikManifest } from './build/manifest';
import { qwik } from './vite';

const optimizerMock = vi.hoisted(() => ({
	createOptimizer: vi.fn(),
	transformModules: vi.fn(),
}));
const vitefuMock = vi.hoisted(() => ({
	crawlFrameworkPkgs: vi.fn(),
}));

vi.mock('@qwik.dev/optimizer', () => ({
	createOptimizer: optimizerMock.createOptimizer,
}));
vi.mock('vitefu', () => ({
	crawlFrameworkPkgs: vitefuMock.crawlFrameworkPkgs,
}));

beforeEach(() => {
	optimizerMock.createOptimizer.mockReset();
	optimizerMock.transformModules.mockReset();
	vitefuMock.crawlFrameworkPkgs.mockReset();
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
	vitefuMock.crawlFrameworkPkgs.mockResolvedValue({
		optimizeDeps: { include: [], exclude: [] },
		ssr: { noExternal: [], external: [] },
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

	test('sets Vite config defaults for app builds', async () => {
		const plugin = getQwikPlugin();
		const config: UserConfig = {
			build: {
				rolldownOptions: {
					external: ['external-dependency'],
				},
			},
		};

		await callConfig(plugin, config, { command: 'build', mode: 'production' });

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

	test('uses vitefu to exclude Qwik deps from optimization and SSR externalization', async () => {
		vitefuMock.crawlFrameworkPkgs.mockResolvedValueOnce({
			optimizeDeps: { include: [], exclude: ['@fixtures/qwik-lib'] },
			ssr: { noExternal: ['@fixtures/qwik-lib'], external: [] },
		});
		const plugin = getQwikPlugin();
		const config: UserConfig = { root: '/workspace/app' };

		const result = await callConfig(plugin, config, {
			command: 'serve',
			mode: 'development',
		});

		expect(result).toEqual({
			optimizeDeps: { include: [], exclude: ['@fixtures/qwik-lib'] },
			ssr: { noExternal: ['@fixtures/qwik-lib'], external: [] },
		});
		expect(vitefuMock.crawlFrameworkPkgs).toHaveBeenCalledWith(
			expect.objectContaining({
				root: '/workspace/app',
				isBuild: false,
				viteUserConfig: config,
			}),
		);

		const [crawlOptions] = vitefuMock.crawlFrameworkPkgs.mock.calls[0] ?? [];
		if (!crawlOptions) {
			throw new Error('Expected crawlFrameworkPkgs options');
		}
		expect(crawlOptions.isFrameworkPkgByJson({ qwik: './lib/index.qwik.mjs' })).toBe(true);
		expect(
			crawlOptions.isFrameworkPkgByJson({ peerDependencies: { '@qwik.dev/core': '^2.0.0' } }),
		).toBe(true);
		expect(crawlOptions.isFrameworkPkgByJson({ dependencies: { plain: '1.0.0' } })).toBe(false);

		const environmentConfig: EnvironmentOptions = {
			resolve: { noExternal: ['existing'] },
		};
		const environmentResult = callConfigEnvironment(plugin, 'ssr', environmentConfig);

		expect(environmentResult).toEqual({
			resolve: { noExternal: ['existing', '@fixtures/qwik-lib'] },
		});
		expect(
			callConfigEnvironment(plugin, 'ssr', {
				resolve: { noExternal: ['existing', '@fixtures/qwik-lib'] },
			}),
		).toBeUndefined();
		expect(
			callConfigEnvironment(plugin, 'ssr', { resolve: { noExternal: true } }),
		).toBeUndefined();
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
		expect(callOutputOptions(plugin, { dir: 'server' }, { consumer: 'server' })).toMatchObject({
			dir: 'server',
			chunkFileNames: 'q-[hash].js',
			hoistTransitiveImports: false,
			codeSplitting: {
				includeDependenciesRecursively: false,
			},
		});
		expect(
			callOutputOptions(plugin, { entryFileNames: '[name].js' }, { build: { lib: true } }),
		).toEqual({
			entryFileNames: '[name].js',
		});
	});

	test('keeps Vite library config output under host control', async () => {
		const plugin = getQwikPlugin();
		const config: UserConfig = {
			build: {
				lib: { entry: 'src/index.tsx' },
				rolldownOptions: {},
			},
		};

		await callConfig(plugin, config, { command: 'build', mode: 'production' });

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
	config: UserConfig,
	env: { command: 'build' | 'serve'; mode: string },
) {
	const configHook = plugin.config;
	if (typeof configHook === 'function') {
		return configHook.call({} as never, config as never, env as never);
	}
	if (configHook && 'handler' in configHook) {
		return configHook.handler.call({} as never, config as never, env as never);
	}
	throw new Error('Expected function config hook');
}

function callConfigEnvironment(plugin: Plugin, name: string, config: EnvironmentOptions) {
	const configEnvironment = plugin.configEnvironment;
	if (typeof configEnvironment === 'function') {
		return configEnvironment.call({} as never, name, config, {} as never);
	}
	if (configEnvironment && 'handler' in configEnvironment) {
		return configEnvironment.handler.call({} as never, name, config, {} as never);
	}
	throw new Error('Expected function configEnvironment hook');
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

function createHookContext(consumer: 'client' | 'server', build: { lib?: unknown }) {
	return {
		environment: { config: { consumer, build } },
		emitFile: vi.fn(),
		resolve: vi.fn(),
	};
}
