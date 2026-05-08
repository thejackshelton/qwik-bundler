import { beforeEach, describe, expect, test, vi } from 'vitest';
import { QWIK_MANIFEST, type QwikManifest } from '../src/build/manifest';
import { qwikClient, qwikServer } from '../src/rolldown';
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
		await callTransform(plugin, 'source', '/workspace/app/src/root.tsx');
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
					exports: ['_run'],
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

	test('warns when server manifest injection has no manifest available', async () => {
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

		expect(warn).toHaveBeenCalledWith(
			expect.objectContaining({
				id: '/workspace/server-only/node_modules/@qwik.dev/core/dist/server.mjs',
				plugin: 'qwik',
				message: expect.stringContaining('Qwik server manifest'),
			}),
		);
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
