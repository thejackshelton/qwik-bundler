import { createOptimizer } from '@qwik.dev/optimizer';
import type { Plugin } from 'rolldown';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { qwik, qwikClient, qwikLib, qwikServer } from './rolldown';
import { QWIK_MANIFEST, type QwikManifest } from './q-manifest';

type QwikOutputOptions = {
	codeSplitting?: {
		includeDependenciesRecursively?: boolean;
		groups?: Array<{ name: string }>;
	};
};

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

describe('Rolldown plugin', () => {
	test('defaults qwik() to the client plugin', async () => {
		const plugin = qwik();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = await callTransform(
			plugin,
			'export const answer = 42;',
			'/workspace/app/src/root.tsx',
		);

		expect(createOptimizer).toHaveBeenCalledWith(undefined);
		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				input: [{ code: 'export const answer = 42;', path: '/workspace/app/src/root.tsx' }],
				rootDir: '/workspace/app',
				srcDir: '/workspace/app',
				isServer: false,
				mode: 'prod',
			}),
		);
		expect(result).toEqual({ code: 'optimized', map: null });
	});

	test('sets Qwik runtime defines without replacing host defines', () => {
		const plugin = qwikClient({ experimental: ['suspense'] });
		const options = {
			transform: {
				define: {
					'globalThis.qDev': 'true',
				},
			},
		};

		callOptions(plugin, options);

		expect(options.transform.define).toEqual({
			'__EXPERIMENTAL__.each': 'false',
			'__EXPERIMENTAL__.enableRequestRewrite': 'false',
			'__EXPERIMENTAL__.insights': 'false',
			'__EXPERIMENTAL__.noSPA': 'false',
			'__EXPERIMENTAL__.preventNavigate': 'false',
			'__EXPERIMENTAL__.suspense': 'true',
			'__EXPERIMENTAL__.valibot': 'false',
			'__EXPERIMENTAL__.webWorker': 'false',
			'globalThis.qDev': 'true',
			'import.meta.env.BASE_URL': '"/"',
			'import.meta.env.DEV': 'false',
			'import.meta.env.MODE': '"production"',
			'import.meta.env.TEST': 'false',
		});
	});

	test('sets client input defaults for Qwik runtime chunk groups', () => {
		const options = {};

		callOptions(qwikClient(), options);

		expect(options).toHaveProperty('preserveEntrySignatures', 'allow-extension');
	});

	test('does not set client-only input defaults for server and library builds', () => {
		const serverOptions = {};
		const libOptions = {};

		callOptions(qwikServer(), serverOptions);
		callOptions(qwikLib(), libOptions);

		expect(serverOptions).not.toHaveProperty('preserveEntrySignatures');
		expect(libOptions).not.toHaveProperty('preserveEntrySignatures');
	});

	test('emits Qwik runtime entries as resolved client chunks', async () => {
		const plugin = qwikClient();
		const emitFile = vi.fn();
		const resolve = vi.fn((id: string) => Promise.resolve({ id }));

		await callResolveId(
			plugin,
			'@qwik.dev/core',
			'/workspace/app/src/root.tsx',
			resolve,
			emitFile,
		);

		expect(resolve).toHaveBeenNthCalledWith(
			1,
			'@qwik.dev/core/handlers.mjs',
			'/workspace/app/src/root.tsx',
			{
				skipSelf: true,
			},
		);
		expect(resolve).toHaveBeenNthCalledWith(
			2,
			'@qwik.dev/core/preloader',
			'/workspace/app/src/root.tsx',
			{
				skipSelf: true,
			},
		);
		expect(emitFile).toHaveBeenNthCalledWith(1, {
			type: 'chunk',
			id: '@qwik.dev/core/handlers.mjs',
			name: 'handlers',
		});
		expect(emitFile).toHaveBeenNthCalledWith(2, {
			type: 'chunk',
			id: '@qwik.dev/core/preloader',
			name: 'preloader',
		});
	});

	test('uses explicit output defaults for each environment', () => {
		const clientOutput = callOutputOptions(qwikClient(), { dir: 'dist' }) as QwikOutputOptions;
		expect(clientOutput).toMatchObject({
			dir: 'dist',
			entryFileNames: 'build/q-[hash].js',
			chunkFileNames: 'build/q-[hash].js',
			hoistTransitiveImports: false,
			codeSplitting: {
				includeDependenciesRecursively: false,
			},
		});
		expect(clientOutput.codeSplitting?.groups?.map((group) => group.name)).toEqual([
			'qwik-core',
			'qwik-loader',
			'qwik-preloader',
		]);
		expect(callOutputOptions(qwikServer(), { dir: 'server' })).toEqual({
			dir: 'server',
			chunkFileNames: 'q-[hash].js',
			hoistTransitiveImports: false,
		});
		expect(callOutputOptions(qwikLib(), { entryFileNames: '[name].js' })).toEqual({
			entryFileNames: '[name].js',
		});
	});

	test('appends user code splitting groups after Qwik groups', () => {
		const userGroup = { name: 'vendor', test: /vendor/ };
		const output = callOutputOptions(qwikClient(), {
			codeSplitting: { groups: [userGroup] },
		}) as QwikOutputOptions;

		expect(output.codeSplitting?.groups?.map((group) => group.name)).toEqual([
			'qwik-core',
			'qwik-loader',
			'qwik-preloader',
			'vendor',
		]);
		expect(output.codeSplitting?.groups?.at(-1)).toBe(userGroup);
	});

	test('rejects boolean code splitting for client builds', () => {
		expect(() => callOutputOptions(qwikClient(), { codeSplitting: true })).toThrow(
			'Qwik requires output.codeSplitting to be an object',
		);
	});

	test('uses server optimizer settings for qwikServer()', async () => {
		const plugin = qwikServer();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, 'export default 1;', '/workspace/app/src/server.ts');

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				isServer: true,
				mode: 'prod',
				entryStrategy: { type: 'hoist' },
			}),
		);
	});

	test('uses library optimizer settings for qwikLib()', async () => {
		const plugin = qwikLib();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, 'export default 1;', '/workspace/app/src/index.tsx');

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				isServer: false,
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

		const plugin = qwikClient();
		callBuildStart(plugin, { cwd: '/workspace/app' });
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
			'/workspace/app/src/entry.ssr',
		);
		if (!result || typeof result === 'string' || !result.code) {
			throw new Error('Expected transformed code');
		}

		const code = result.code;

		expect(code).toContain('"manifestHash":"abc"');
		expect(code).toContain('"bundleGraphAsset":"bundle-graph.json"');
		expect(code).not.toContain('"symbols"');
		expect(code).not.toContain('"bundles"');
		expect(code).not.toContain('"assets"');
	});
});

function callOptions(plugin: Plugin, options: unknown) {
	const optionsHook = plugin.options;
	if (typeof optionsHook === 'function') {
		return optionsHook.call({} as never, options as never);
	}
	throw new Error('Expected function options hook');
}

function callOutputOptions(plugin: Plugin, options: unknown) {
	const outputOptionsHook = plugin.outputOptions;
	if (typeof outputOptionsHook === 'function') {
		return outputOptionsHook.call({} as never, options as never);
	}
	throw new Error('Expected function outputOptions hook');
}

function callBuildStart(plugin: Plugin, options: { cwd: string }) {
	const buildStart = plugin.buildStart;
	if (typeof buildStart === 'function') {
		return buildStart.call({} as never, options as never);
	}
	throw new Error('Expected function buildStart hook');
}

async function callTransform(plugin: Plugin, code: string, id: string, emitFile = vi.fn()) {
	const transform = plugin.transform;
	if (typeof transform === 'function') {
		return transform.call({ emitFile } as never, code, id, undefined as never);
	}
	throw new Error('Expected function transform hook');
}

async function callResolveId(
	plugin: Plugin,
	source: string,
	importer?: string,
	resolve = vi.fn(),
	emitFile = vi.fn(),
) {
	const resolveId = plugin.resolveId;
	if (typeof resolveId === 'function') {
		return resolveId.call({ emitFile, resolve } as never, source, importer, {
			isEntry: false,
		} as never);
	}
	throw new Error('Expected function resolveId hook');
}

async function callLoad(plugin: Plugin, id: string) {
	const load = plugin.load;
	if (typeof load === 'function') {
		return load.call({} as never, id);
	}
	throw new Error('Expected function load hook');
}

async function callGenerateBundle(plugin: Plugin, bundle: unknown, emitFile = vi.fn()) {
	const generateBundle = plugin.generateBundle;
	if (typeof generateBundle === 'function') {
		return generateBundle.call({ emitFile } as never, {} as never, bundle as never, false);
	}
	throw new Error('Expected function generateBundle hook');
}
