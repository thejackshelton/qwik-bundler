import { beforeEach, describe, expect, test, vi } from 'vitest';
import { qwikClient, qwikLib, qwikServer } from '../src/rolldown';
import { callBuildStart, callLoad, callOptions, callResolveId, callTransform } from './helpers';

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

describe('Rolldown runtime integration', () => {
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
		});
	});

	test('sets development runtime defines in dev mode', () => {
		const options = {};

		callOptions(qwikClient({ dev: true }), options);

		expect(options).toHaveProperty(['transform', 'define', 'globalThis.qDev'], 'true');
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

		await callResolveId(plugin, '@qwik.dev/core', '/workspace/app/src/root.tsx', {
			resolve,
			emitFile,
		});

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
			preserveSignature: 'allow-extension',
		});
		expect(emitFile).toHaveBeenNthCalledWith(2, {
			type: 'chunk',
			id: '@qwik.dev/core/preloader',
			name: 'preloader',
			preserveSignature: 'allow-extension',
		});
	});

	test('errors when required Qwik runtime entries cannot be resolved', async () => {
		const plugin = qwikClient();
		const resolve = vi.fn().mockResolvedValue(null);
		const error = vi.fn((value: unknown) => {
			throw value instanceof Error ? value : new Error(String(value));
		});

		await expect(
			callResolveId(plugin, '@qwik.dev/core', '/workspace/app/src/root.tsx', {
				resolve,
				emitFile: vi.fn(),
				error,
			}),
		).rejects.toThrow('Failed to resolve @qwik.dev/core/handlers.mjs');
		expect(error).toHaveBeenCalledTimes(1);
	});

	test('serves dev Qwik handlers without emitting build chunks', async () => {
		const plugin = qwikClient({ dev: true });
		const emitFile = vi.fn();
		const resolve = vi.fn();

		expect(
			await callResolveId(plugin, '/@qwik-handlers', undefined, { resolve, emitFile }),
		).toEqual({
			id: '@qwik-handlers',
			moduleSideEffects: false,
		});
		expect(await callLoad(plugin, '@qwik-handlers')).toEqual("export * from '@qwik.dev/core';");

		await callResolveId(plugin, '@qwik.dev/core', '/workspace/app/src/root.tsx', {
			resolve,
			emitFile,
		});

		expect(emitFile).not.toHaveBeenCalled();
	});

	test('uses dev optimizer mode and root-relative dev paths in dev mode', async () => {
		const plugin = qwikClient({ dev: true });

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, 'export const answer = 42;', '/workspace/app/src/root.tsx');

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				input: [
					expect.objectContaining({
						devPath: '/src/root.tsx',
						path: '/workspace/app/src/root.tsx',
					}),
				],
				mode: 'dev',
				sourceMaps: true,
			}),
		);
	});

	test('serves dev QRL segment URLs from transformed output', async () => {
		optimizerMock.transformModules.mockResolvedValueOnce({
			modules: [
				{
					path: '/workspace/app/src/home.tsx',
					isEntry: false,
					code: 'parent',
					map: null,
					segment: null,
					origPath: null,
				},
				{
					path: '/src/home.tsx_click_abc.js',
					isEntry: false,
					code: 'segment',
					map: null,
					segment: { name: 's_abc' },
					origPath: null,
				},
			],
			diagnostics: [],
			isTypeScript: true,
			isJsx: true,
		});
		const plugin = qwikClient({ dev: true });

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, 'export default 1;', '/workspace/app/src/home.tsx');
		const resolved = await callResolveId(plugin, '/src/home.tsx_click_abc.js');

		expect(await callLoad(plugin, (resolved as { id: string }).id)).toBe('segment');
	});

	test('transforms dev QRL parents on demand', async () => {
		const transformRequest = vi.fn().mockResolvedValue(null);
		const plugin = qwikClient({
			dev: true,
			devServer: { environments: { client: { transformRequest } }, transformRequest },
		});

		const resolved = await callResolveId(plugin, '/src/home.tsx_click_abc.js');
		await callLoad(plugin, (resolved as { id: string }).id);

		expect(transformRequest).toHaveBeenCalledWith('/src/home.tsx');
	});

	test('resolves relative dev QRLs against their source importer', async () => {
		const plugin = qwikClient({ dev: true });

		const resolved = await callResolveId(
			plugin,
			'./home.tsx_home_component_abc.js',
			'\0qwik:segment:client:/workspace/app/src/root.tsx_root_component_def.js',
		);

		expect(resolved).toEqual({
			id: '\0qwik:segment:client:/workspace/app/src/home.tsx_home_component_abc.js',
			moduleSideEffects: false,
		});
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
		expect(await callResolveId(plugin, './home', resolvedId as string, { resolve })).toEqual({
			id: '/workspace/app/src/home.tsx',
		});
		expect(resolve).toHaveBeenCalledWith('./home', '/workspace/app/src/root.tsx', {
			skipSelf: true,
		});
	});
});
