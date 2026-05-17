import { beforeEach, describe, expect, test, vi } from 'vitest';
import { convertManifestToBundleGraph } from '../src/build/bundle-graph';
import { createManifest, QWIK_MANIFEST } from '../src/build/manifest';
import { qwikClient, qwikServer } from '../src/rolldown';
import type { QwikManifestBundle } from '../src/build/manifest';
import type { QwikBundleGraph, QwikManifest } from '../src/types';
import { callBuildStart, callGenerateBundle, callTransform } from './helpers';

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

describe('Qwik manifest output', () => {
	test('emits a production manifest and bundle graph from client output', async () => {
		optimizerMock.transformModules.mockResolvedValueOnce({
			modules: [
				{
					path: '/workspace/app/src/root.tsx',
					isEntry: false,
					code: 'optimized',
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
		let manifest: QwikManifest | undefined;
		const plugin = qwikClient({ onManifest: (nextManifest) => (manifest = nextManifest) });
		const emitFile = vi.fn();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(
			plugin,
			"import { component$ } from '@qwik.dev/core';",
			'/workspace/app/src/root.tsx',
		);
		await callGenerateBundle(
			plugin,
			{
				'build/q-entry.js': {
					type: 'chunk',
					fileName: 'build/q-entry.js',
					name: 'entry',
					code: 'import "./q-symbol.js"; export const entry = 1;',
					exports: ['entry'],
					imports: ['build/q-symbol.js', 'build/q-core.js'],
					dynamicImports: [],
					moduleIds: ['/workspace/app/src/root.tsx'],
					facadeModuleId: '/workspace/app/src/root.tsx',
				},
				'build/q-symbol.js': {
					type: 'chunk',
					fileName: 'build/q-symbol.js',
					name: 'root_component_abc',
					code: 'export const s_abc = () => "Hello";',
					exports: ['s_abc'],
					imports: [],
					dynamicImports: [],
					moduleIds: ['/workspace/app/src/root.tsx_root_component_abc.js'],
					facadeModuleId: '/workspace/app/src/root.tsx_root_component_abc.js',
				},
				'build/q-core.js': {
					type: 'chunk',
					fileName: 'build/q-core.js',
					name: 'qwik-core',
					code: 'export const _chk = 1;',
					exports: ['_chk'],
					imports: [],
					dynamicImports: [],
					moduleIds: [
						'/workspace/app/node_modules/@qwik.dev/core/dist/core.prod.mjs',
						'/workspace/app/node_modules/@qwik.dev/core/handlers.mjs',
					],
					facadeModuleId: '/workspace/app/node_modules/@qwik.dev/core/dist/core.prod.mjs',
				},
				'build/q-handlers.js': {
					type: 'chunk',
					fileName: 'build/q-handlers.js',
					name: 'handlers',
					code: 'export const _run = 1;',
					exports: ['_run', '_reR'],
					imports: ['build/q-core.js'],
					dynamicImports: [],
					moduleIds: ['/workspace/app/node_modules/@qwik.dev/core/handlers.mjs'],
					facadeModuleId: '/workspace/app/node_modules/@qwik.dev/core/handlers.mjs',
				},
				'build/style.css': {
					type: 'asset',
					fileName: 'build/style.css',
					name: 'style.css',
					names: ['style.css'],
					source: 'body{}',
				},
				'build/q-entry.js.map': {
					type: 'asset',
					fileName: 'build/q-entry.js.map',
					name: 'q-entry.js.map',
					names: ['q-entry.js.map'],
					source: '{}',
				},
			},
			emitFile,
		);

		expect(manifest?.mapping.s_abc).toBe('q-symbol.js');
		expect(manifest?.mapping._chk).toBe('q-core.js');
		expect(manifest?.mapping._run).toBe('q-handlers.js');
		expect(manifest?.mapping._reR).toBe('q-handlers.js');
		expect(manifest?.symbols.s_abc).toMatchObject({ displayName: 'root.tsx_root_component' });
		expect(manifest?.bundles['q-entry.js']).toMatchObject({
			imports: ['q-symbol.js'],
			total: expect.any(Number),
		});
		expect(manifest?.assets?.['build/style.css']).toEqual({ name: 'style.css', size: 6 });
		expect(manifest?.assets?.['build/q-entry.js.map']).toBeUndefined();
		expect(manifest?.bundleGraphAsset).toBe('build/bundle-graph.json');
		expect(manifest?.bundleGraph).toContain('abc');
		expect(manifest?.manifestHash).toEqual(expect.any(String));
		expect(emitFile).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'asset', fileName: 'build/bundle-graph.json' }),
		);
		expect(emitFile).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'asset', fileName: 'q-manifest.json' }),
		);
	});

	test('detects Qwik runtime bundles without a project package.json root', () => {
		const manifest = createManifest(
			{
				'build/q-entry.js': {
					type: 'chunk',
					fileName: 'build/q-entry.js',
					name: 'entry',
					code: 'export const entry = 1;',
					exports: ['entry'],
					imports: ['build/q-core.js', 'build/q-preloader.js'],
					dynamicImports: [],
					moduleIds: ['/deno/app/src/main.tsx'],
					facadeModuleId: '/deno/app/src/main.tsx',
				},
				'build/q-core.js': {
					type: 'chunk',
					fileName: 'build/q-core.js',
					name: 'qwik-core',
					code: 'export const _chk = 1; export const _run = 1;',
					exports: ['_chk', '_run'],
					imports: [],
					dynamicImports: [],
					moduleIds: [
						'/deno/npm/@qwik.dev/core/dist/core.prod.mjs',
						'/deno/npm/@qwik.dev/core/handlers.mjs',
					],
					facadeModuleId: '/deno/npm/@qwik.dev/core/dist/core.prod.mjs',
				},
				'build/q-preloader.js': {
					type: 'chunk',
					fileName: 'build/q-preloader.js',
					name: 'preloader',
					code: 'export const l = () => {};',
					exports: ['l'],
					imports: [],
					dynamicImports: [],
					moduleIds: ['/deno/npm/@qwik.dev/core/dist/preloader.mjs'],
					facadeModuleId: '/deno/npm/@qwik.dev/core/dist/preloader.mjs',
				},
			} as never,
			new Map(),
			undefined,
		);

		expect(manifest.core).toBe('build/q-core.js');
		expect(manifest.preloader).toBe('build/q-preloader.js');
		expect(manifest.mapping._chk).toBe('build/q-core.js');
		expect(manifest.mapping._run).toBe('build/q-core.js');
		expect(manifest.bundles['build/q-core.js']?.origins).toEqual([
			'/deno/npm/@qwik.dev/core/dist/core.prod.mjs',
			'/deno/npm/@qwik.dev/core/handlers.mjs',
		]);
	});

	test('creates a manifest from a bundler-neutral output shape', () => {
		const bundle = {
			'build/q-entry.js': {
				type: 'chunk',
				fileName: 'build/q-entry.js',
				name: 'entry',
				code: 'export const entry = 1;',
				exports: ['entry'],
				imports: ['build/q-child.js', 'build/q-core.js'],
				dynamicImports: [],
				moduleIds: ['/workspace/app/src/main.tsx'],
				facadeModuleId: '/workspace/app/src/main.tsx',
			},
			'build/q-child.js': {
				type: 'chunk',
				fileName: 'build/q-child.js',
				name: 'child',
				code: 'export const child = 1;',
				exports: ['child'],
				imports: [],
				dynamicImports: [],
				moduleIds: ['/workspace/app/src/child.ts'],
				facadeModuleId: '/workspace/app/src/child.ts',
			},
			'build/q-core.js': {
				type: 'chunk',
				fileName: 'build/q-core.js',
				name: 'qwik-core',
				code: 'export const _chk = 1;',
				exports: ['_chk'],
				imports: [],
				dynamicImports: [],
				moduleIds: ['/workspace/app/node_modules/@qwik.dev/core/dist/core.prod.mjs'],
				facadeModuleId: '/workspace/app/node_modules/@qwik.dev/core/dist/core.prod.mjs',
			},
			'build/style.css': {
				type: 'asset',
				fileName: 'build/style.css',
				source: 'body{}',
			},
		} satisfies QwikManifestBundle;

		const manifest = createManifest(bundle, new Map(), '/workspace/app');

		expect(manifest.core).toBe('build/q-core.js');
		expect(manifest.bundles['build/q-entry.js']).toMatchObject({
			imports: ['build/q-child.js'],
			origins: ['src/main.tsx'],
		});
		expect(manifest.assets?.['build/style.css']).toEqual({
			name: undefined,
			size: 6,
		});
	});

	test('computes bundle total size from static import graph', async () => {
		let manifest: QwikManifest | undefined;
		const plugin = qwikClient({ onManifest: (nextManifest) => (manifest = nextManifest) });

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callGenerateBundle(plugin, {
			'build/q-entry.js': {
				type: 'chunk',
				fileName: 'build/q-entry.js',
				name: 'entry',
				code: '12345',
				exports: [],
				imports: ['build/q-a.js'],
				dynamicImports: [],
				moduleIds: ['/workspace/app/src/entry.tsx'],
				facadeModuleId: '/workspace/app/src/entry.tsx',
			},
			'build/q-a.js': {
				type: 'chunk',
				fileName: 'build/q-a.js',
				name: 'a',
				code: '123',
				exports: [],
				imports: ['build/q-b.js'],
				dynamicImports: [],
				moduleIds: ['/workspace/app/src/a.ts'],
				facadeModuleId: '/workspace/app/src/a.ts',
			},
			'build/q-b.js': {
				type: 'chunk',
				fileName: 'build/q-b.js',
				name: 'b',
				code: '12',
				exports: [],
				imports: [],
				dynamicImports: [],
				moduleIds: ['/workspace/app/src/b.ts'],
				facadeModuleId: '/workspace/app/src/b.ts',
			},
		});

		expect(manifest?.bundles['q-entry.js']?.total).toBe(10);
		expect(manifest?.bundles['q-a.js']?.total).toBe(5);
		expect(manifest?.bundles['q-b.js']?.total).toBe(2);
	});

	test.each([
		['onSubmit$', 'Form_onSubmit_abc12345', 'Form_onSubmit'],
		['customHandler$', 'Widget_customSignal_abc12345', 'Widget_customSignal'],
	])(
		'scores event handler interactivity from ctxKind for %s',
		async (ctxName, symbolName, displayName) => {
			optimizerMock.transformModules.mockResolvedValueOnce({
				modules: [
					{
						path: '/workspace/app/src/widget.tsx',
						isEntry: false,
						code: 'optimized',
						map: null,
						segment: null,
						origPath: null,
					},
					{
						path: '/workspace/app/src/widget.tsx_event_abc12345.js',
						isEntry: false,
						code: `export const ${symbolName} = () => {};`,
						map: null,
						segment: {
							origin: '/workspace/app/src/widget.tsx',
							name: symbolName,
							entry: null,
							displayName,
							hash: 'abc12345',
							canonicalFilename: 'widget.tsx_event_abc12345',
							extension: 'js',
							parent: null,
							ctxKind: 'eventHandler',
							ctxName,
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
			let manifest: QwikManifest | undefined;
			const plugin = qwikClient({ onManifest: (nextManifest) => (manifest = nextManifest) });

			callBuildStart(plugin, { cwd: '/workspace/app' });
			await callTransform(
				plugin,
				"import { component$ } from '@qwik.dev/core';",
				'/workspace/app/src/widget.tsx',
			);
			await callGenerateBundle(plugin, {
				'build/q-event.js': {
					type: 'chunk',
					fileName: 'build/q-event.js',
					name: 'event',
					code: `export const ${symbolName} = () => {};`,
					exports: [symbolName],
					imports: [],
					dynamicImports: [],
					moduleIds: ['/workspace/app/src/widget.tsx_event_abc12345.js'],
					facadeModuleId: '/workspace/app/src/widget.tsx_event_abc12345.js',
				},
			});

			expect(manifest?.bundles['q-event.js']?.interactivity).toBe(5);
		},
	);

	test.each([
		['component$', 2],
		['useAsync$', 3],
		['useUnknown$', 1],
	])('scores function interactivity from explicit ctxName table for %s', (ctxName, expected) => {
		const symbolName = `Widget_${ctxName.replace(/\W/g, '')}_abc12345`;
		const manifest = createManifest(
			{
				'build/q-function.js': {
					type: 'chunk',
					fileName: 'build/q-function.js',
					name: 'function',
					code: `export const ${symbolName} = () => {};`,
					exports: [symbolName],
					imports: [],
					dynamicImports: [],
					moduleIds: ['/workspace/app/src/widget.tsx'],
					facadeModuleId: '/workspace/app/src/widget.tsx',
				},
			} as never,
			new Map([
				[
					symbolName,
					{
						origin: '/workspace/app/src/widget.tsx',
						name: symbolName,
						entry: null,
						displayName: `Widget_${ctxName}`,
						hash: 'abc12345',
						canonicalFilename: 'widget.tsx_function_abc12345',
						extension: 'js',
						parent: null,
						ctxKind: 'function',
						ctxName,
						captures: false,
						loc: [0, 0],
					},
				],
			]),
			'/workspace/app',
		);

		expect(manifest.bundles['build/q-function.js']?.interactivity).toBe(expected);
	});

	test('maps inlined QRL symbols from library modules', async () => {
		let manifest: QwikManifest | undefined;
		const plugin = qwikClient({ onManifest: (nextManifest) => (manifest = nextManifest) });

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callGenerateBundle(plugin, {
			'build/q-lib.js': {
				type: 'chunk',
				fileName: 'build/q-lib.js',
				name: 'lib',
				code: 'const Card = c(r(() => "card", "Card_component_D8Jm0aJFndY")); export { Card };',
				exports: ['Card'],
				imports: [],
				dynamicImports: [],
				moduleIds: [
					'/workspace/app/node_modules/@fixtures/rolldown-library/lib/index.qwik.mjs',
				],
				facadeModuleId:
					'/workspace/app/node_modules/@fixtures/rolldown-library/lib/index.qwik.mjs',
			},
		});

		expect(manifest?.mapping.Card_component_D8Jm0aJFndY).toBe('q-lib.js');
		expect(manifest?.symbols.Card_component_D8Jm0aJFndY).toBeUndefined();
		expect(manifest?.bundles['q-lib.js']?.symbols).toBeUndefined();
		expect(manifest?.bundles['q-lib.js']?.interactivity).toBeUndefined();
		expect(manifest?.bundleGraph).toContain('D8Jm0aJFndY');
	});

	test('ignores symbol-like strings outside library modules', async () => {
		let manifest: QwikManifest | undefined;
		const plugin = qwikClient({ onManifest: (nextManifest) => (manifest = nextManifest) });

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callGenerateBundle(plugin, {
			'build/q-app.js': {
				type: 'chunk',
				fileName: 'build/q-app.js',
				name: 'app',
				code: 'const label = "NotAQrl_12345678"; export { label };',
				exports: ['label'],
				imports: [],
				dynamicImports: [],
				moduleIds: ['/workspace/app/src/root.tsx'],
				facadeModuleId: '/workspace/app/src/root.tsx',
			},
		});

		expect(manifest?.mapping.NotAQrl_12345678).toBeUndefined();
		expect(manifest?.bundleGraph).not.toContain('12345678');
	});

	test('includes symbol bundle static imports on symbol graph nodes for render-time preload', () => {
		const manifest = {
			bundles: {
				'q-click.js': {
					size: 100,
					total: 100,
					imports: ['q-handlers.js'],
					symbols: ['Button_onClick_abc12345'],
				},
				'q-handlers.js': {
					size: 50,
					total: 50,
				},
			},
			mapping: { Button_onClick_abc12345: 'q-click.js' },
			symbols: {},
			manifestHash: '',
			version: '1',
		} as QwikManifest;

		const graph = convertManifestToBundleGraph(manifest);

		expect(graphDeps(graph, 'abc12345')).toEqual(
			expect.arrayContaining(['q-click.js', 'q-handlers.js']),
		);
	});

	test('treats the handlers bundle as an event handler preload dependency', () => {
		const manifest = {
			bundles: {
				'q-click.js': { size: 100, total: 100, symbols: ['Button_onClick_abc12345'] },
				'q-handlers.js': { size: 50, total: 50 },
			},
			mapping: { _run: 'q-handlers.js', Button_onClick_abc12345: 'q-click.js' },
			symbols: { Button_onClick_abc12345: { ctxKind: 'eventHandler' } },
			manifestHash: '',
			version: '1',
		} as QwikManifest;

		const graph = convertManifestToBundleGraph(manifest);

		expect(graphDeps(graph, 'q-click.js')).toContain('q-handlers.js');
	});

	test('prunes transitive static preload dependencies from bundle graph nodes', () => {
		const manifest = {
			bundles: {
				'q-entry.js': {
					size: 100,
					total: 100,
					imports: ['q-a.js', 'q-b.js', 'q-c.js'],
				},
				'q-a.js': { size: 50, total: 50, imports: ['q-b.js'] },
				'q-b.js': { size: 50, total: 50, imports: ['q-c.js'] },
				'q-c.js': { size: 50, total: 50 },
			},
			mapping: {},
			symbols: {},
			manifestHash: '',
			version: '1',
		} as QwikManifest;

		const graph = convertManifestToBundleGraph(manifest);

		expect(graphDeps(graph, 'q-entry.js')).toEqual(['q-a.js']);
	});

	test('rejects cyclic static preload dependencies', () => {
		const manifest = {
			bundles: {
				'q-a.js': { size: 50, total: 50, imports: ['q-b.js'] },
				'q-b.js': { size: 50, total: 50, imports: ['q-a.js'] },
			},
			mapping: {},
			symbols: {},
			manifestHash: '',
			version: '1',
		} as QwikManifest;

		expect(() => convertManifestToBundleGraph(manifest)).toThrow(/Circular dependency/);
	});

	test('applies bundle graph adders for route and insights preload entries', () => {
		const manifest = {
			bundles: {
				'q-entry.js': { size: 100, total: 100 },
				'q-route.js': { size: 50, total: 50, symbols: ['Route_component_abc12345'] },
			},
			mapping: { Route_component_abc12345: 'q-route.js' },
			symbols: {},
			manifestHash: '',
			version: '1',
		} as QwikManifest;

		const graph = (convertManifestToBundleGraph as any)(
			manifest,
			new Set([() => ({ '/dashboard/': { dynamicImports: ['q-route.js'] } })]),
		);

		expect(graphDynamicDeps(graph, '/dashboard/')).toEqual(['q-route.js']);
	});

	test('filters non-Qwik dynamic imports from bundle graph nodes', () => {
		const manifest = {
			bundles: {
				'q-entry.js': {
					size: 100,
					total: 100,
					dynamicImports: ['q-symbol.js', 'q-source.js', 'q-language.js'],
				},
				'q-symbol.js': { size: 50, total: 50, symbols: ['Symbol_component_abc12345'] },
				'q-source.js': { size: 50, total: 50, origins: ['src/entry.tsx'] },
				'q-language.js': { size: 50, total: 50, origins: ['node_modules/shiki/lang.js'] },
			},
			mapping: {},
			symbols: {},
			manifestHash: '',
			version: '1',
		} as QwikManifest;

		const graph = convertManifestToBundleGraph(manifest);

		expect(graphDynamicDeps(graph, 'q-entry.js')).toEqual(['q-symbol.js']);
	});

	test('uses probability buckets for dynamic preload dependencies', () => {
		const manifest = {
			bundles: {
				'q-entry.js': {
					size: 100,
					total: 100,
					dynamicImports: ['q-later.js', 'q-click.js', 'q-small.js'],
					origins: ['src/root.tsx'],
				},
				'q-click.js': {
					size: 500,
					total: 500,
					interactivity: 5,
					symbols: ['Button_onClick_abc12345'],
					origins: ['src/root.tsx_click_abc12345.js'],
				},
				'q-small.js': {
					size: 100,
					total: 100,
					symbols: ['Small_component_abc12345'],
				},
				'q-later.js': {
					size: 20_000,
					total: 20_000,
					symbols: ['Later_component_abc12345'],
				},
			},
			mapping: {},
			symbols: {},
			manifestHash: '',
			version: '1',
		} as QwikManifest;

		const graph = convertManifestToBundleGraph(manifest);

		expect(graphDynamicDeps(graph, 'q-entry.js')).toEqual([
			'q-click.js',
			'q-small.js',
			'q-later.js',
		]);
		expect(graphDynamicMarkers(graph, 'q-entry.js')).toEqual([-10, -7, -5]);
	});

	test('removes isolated unused bundles from the bundle graph', () => {
		const manifest = {
			bundles: {
				'q-entry.js': { size: 100, total: 100, imports: ['q-used.js'] },
				'q-used.js': { size: 50, total: 50 },
				'q-unused.js': { size: 50, total: 50 },
			},
			mapping: {},
			symbols: {},
			manifestHash: '',
			version: '1',
		} as QwikManifest;

		const graph = convertManifestToBundleGraph(manifest);

		expect(graph).not.toContain('q-unused.js');
	});

	test('leaves server manifest placeholder when no manifest is available', async () => {
		const plugin = qwikServer();
		const warn = vi.fn();

		callBuildStart(plugin, { cwd: '/workspace/server-only' });
		const result = await callTransform(
			plugin,
			`export const manifest = ${QWIK_MANIFEST};`,
			'/workspace/server-only/node_modules/@qwik.dev/core/dist/server.mjs',
			{ warn },
		);
		if (!result || typeof result === 'string' || !('code' in result)) {
			throw new Error('Expected transformed code');
		}

		expect(warn).not.toHaveBeenCalled();
		expect(result.code).toContain(QWIK_MANIFEST);
	});

	test('does not warn for missing server manifest in dev mode', async () => {
		const plugin = qwikServer({ dev: true });
		const warn = vi.fn();

		callBuildStart(plugin, { cwd: '/workspace/dev-server' });
		await callTransform(
			plugin,
			`export const manifest = ${QWIK_MANIFEST};`,
			'/workspace/dev-server/node_modules/@qwik.dev/core/dist/core.mjs',
			{ warn },
		);

		expect(warn).not.toHaveBeenCalled();
	});

	test('injects only the server manifest subset for server builds', async () => {
		const manifest = {
			manifestHash: 'abc',
			mapping: { s_abc: 'build/q-symbol.js' },
			injections: [],
			bundleGraph: ['build/q-symbol.js'],
			bundleGraphAsset: 'bundle-graph.json',
			core: 'build/q-core.js',
			preloader: 'build/q-preloader.js',
			qwikLoader: 'build/q-loader.js',
			symbols: { s_abc: {} },
			bundles: { 'build/q-symbol.js': {} },
			assets: { 'bundle-graph.json': {} },
			version: '1',
		} as unknown as QwikManifest;
		const plugin = qwikServer({ manifestInput: manifest });

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = await callTransform(
			plugin,
			`export const manifest = ${QWIK_MANIFEST};`,
			'/workspace/app/node_modules/@qwik.dev/core/dist/server.mjs',
		);
		if (!result || typeof result === 'string' || !('code' in result)) {
			throw new Error('Expected transformed code');
		}

		const code = result.code;

		expect(code).toContain('"manifestHash":"abc"');
		expect(code).toContain('"bundleGraphAsset":"bundle-graph.json"');
		expect(code).not.toContain('"symbols"');
		expect(code).not.toContain('"bundles"');
		expect(code).not.toContain('"assets"');
		expect(optimizerMock.transformModules).not.toHaveBeenCalled();
	});
});

function graphDeps(graph: QwikBundleGraph, nodeName: string) {
	const nodeIndex = graph.indexOf(nodeName);
	if (nodeIndex < 0) {
		throw new Error(`Expected graph node ${nodeName}`);
	}

	const deps: string[] = [];
	for (let index = nodeIndex + 1; index < graph.length; index++) {
		const value = graph[index];
		if (typeof value === 'string') break;
		if (typeof value !== 'number' || value < 0) continue;
		const dep = graph[value];
		if (typeof dep === 'string') {
			deps.push(dep);
		}
	}
	return deps;
}

function graphDynamicDeps(graph: QwikBundleGraph, nodeName: string) {
	const nodeIndex = graph.indexOf(nodeName);
	if (nodeIndex < 0) {
		throw new Error(`Expected graph node ${nodeName}`);
	}

	const deps: string[] = [];
	let dynamic = false;
	for (let index = nodeIndex + 1; index < graph.length; index++) {
		const value = graph[index];
		if (typeof value === 'string') break;
		if (typeof value !== 'number') continue;
		if (value < 0) {
			dynamic = true;
			continue;
		}
		if (!dynamic) continue;
		const dep = graph[value];
		if (typeof dep === 'string') deps.push(dep);
	}
	return deps;
}

function graphDynamicMarkers(graph: QwikBundleGraph, nodeName: string) {
	const nodeIndex = graph.indexOf(nodeName);
	if (nodeIndex < 0) {
		throw new Error(`Expected graph node ${nodeName}`);
	}

	const markers: number[] = [];
	for (let index = nodeIndex + 1; index < graph.length; index++) {
		const value = graph[index];
		if (typeof value === 'string') break;
		if (typeof value === 'number' && value < 0) markers.push(value);
	}
	if (markers.length > 0) return markers;
	throw new Error(`Expected graph node ${nodeName} to have dynamic dependencies`);
}
