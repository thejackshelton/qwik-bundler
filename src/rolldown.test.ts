import { createOptimizer } from '@qwik.dev/optimizer';
import type { Plugin } from 'rolldown';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { qwik, qwikClient, qwikLib, qwikServer } from './rolldown';

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
		const plugin = qwikClient();
		const options = {
			transform: {
				define: {
					'globalThis.qDev': 'true',
				},
			},
		};

		callOptions(plugin, options);

		expect(options.transform.define).toEqual({
			'globalThis.qDev': 'true',
			'import.meta.env.BASE_URL': '"/"',
			'import.meta.env.DEV': 'false',
			'import.meta.env.MODE': '"production"',
			'import.meta.env.TEST': 'false',
		});
	});

	test('emits Qwik handlers as a resolved client chunk', async () => {
		const plugin = qwikClient();
		const emitFile = vi.fn();
		const resolve = vi.fn().mockResolvedValue({ id: '@qwik.dev/core/handlers.mjs' });

		await callResolveId(
			plugin,
			'@qwik.dev/core',
			'/workspace/app/src/root.tsx',
			resolve,
			emitFile,
		);

		expect(resolve).toHaveBeenCalledWith(
			'@qwik.dev/core/handlers.mjs',
			'/workspace/app/src/root.tsx',
			{
				skipSelf: true,
			},
		);
		expect(emitFile).toHaveBeenCalledWith({
			type: 'chunk',
			id: '@qwik.dev/core/handlers.mjs',
			name: 'handlers',
		});
	});

	test('uses explicit output defaults for each environment', () => {
		expect(callOutputOptions(qwikClient(), { dir: 'dist' })).toEqual({
			dir: 'dist',
			entryFileNames: 'build/q-[hash].js',
			chunkFileNames: 'build/q-[hash].js',
			hoistTransitiveImports: false,
		});
		expect(callOutputOptions(qwikServer(), { dir: 'server' })).toEqual({
			dir: 'server',
			chunkFileNames: 'q-[hash].js',
			hoistTransitiveImports: false,
		});
		expect(callOutputOptions(qwikLib(), { entryFileNames: '[name].js' })).toEqual({
			entryFileNames: '[name].js',
		});
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
