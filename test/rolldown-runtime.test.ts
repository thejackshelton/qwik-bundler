import { beforeEach, describe, expect, test, vi } from 'vitest';
import { plugin as qwikPlugin, qwikClient, qwikLib, qwikServer } from '../src/rolldown';
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
			'globalThis.qInspector': 'false',
		});
	});

	test('sets development runtime defines in dev mode', () => {
		const options = {};

		callOptions(qwikClient({ dev: true }), options);

		expect(options).toHaveProperty(['transform', 'define', 'globalThis.qDev'], 'true');
		expect(options).toHaveProperty(['transform', 'define', 'globalThis.qInspector'], 'true');
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

	test('uses HMR optimizer mode and root-relative dev paths in dev mode', async () => {
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
				mode: 'hmr',
				sourceMaps: true,
			}),
		);
	});

	test('GATE-04 raw client production segments do not append dev HMR accept code', async () => {
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
					path: '/workspace/app/src/home.tsx_click_abc.js',
					isEntry: false,
					code: 'export const click = () => "click";',
					map: null,
					segment: { name: 's_click', ctxName: 'component$' },
					origPath: null,
				},
			],
			diagnostics: [],
			isTypeScript: true,
			isJsx: true,
		});
		const plugin = qwikClient();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, 'export default 1;', '/workspace/app/src/home.tsx');
		const resolved = await callResolveId(
			plugin,
			'./home.tsx_click_abc.js',
			'/workspace/app/src/home.tsx',
		);
		const code = await callLoad(plugin, resolved as string);

		expect(code).toBe('export const click = () => "click";');
		expect(code).not.toContain('import.meta.hot.accept(');
		expect(code).not.toContain("CustomEvent('qHmr'");
		expect(code).not.toContain('document.__hmrT');
		expect(code).not.toContain('location.reload');
		expectTransformModulesNeverCalledWithHmr();
	});

	test('GATE-04 server and library transforms do not emit HMR runtime strings', async () => {
		const forbiddenHmrStrings = [
			'virtual:qwik-hmr-bridge',
			'qwik:hmr',
			'import.meta.hot.accept(',
			"CustomEvent('qHmr'",
			'document.__hmrT',
			'location.reload',
		];
		const server = qwikServer();
		const lib = qwikLib();

		callBuildStart(server, { cwd: '/workspace/app' });
		callBuildStart(lib, { cwd: '/workspace/app' });
		const serverCode = await callTransform(
			server,
			'export default 1;',
			'/workspace/app/src/server.tsx',
		);
		const libCode = await callTransform(
			lib,
			'export default 1;',
			'/workspace/app/src/index.tsx',
		);

		const output = JSON.stringify([serverCode, libCode]);
		for (const forbidden of forbiddenHmrStrings) {
			expect(output).not.toContain(forbidden);
		}
		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({ isServer: true, mode: 'prod' }),
		);
		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({ isServer: false, mode: 'lib' }),
		);
		expectTransformModulesNeverCalledWithHmr();
	});

	test('uses dev optimizer mode when HMR is disabled', async () => {
		const plugin = qwikClient({ dev: true, hmr: false });

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, 'export const answer = 42;', '/workspace/app/src/root.tsx');

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
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

		expect(await callLoad(plugin, (resolved as { id: string }).id)).toContain('segment');
	});

	test('keeps client and server dev segment cache entries isolated', async () => {
		optimizerMock.transformModules
			.mockResolvedValueOnce({
				modules: [
					{
						path: '/workspace/app/src/shared.tsx',
						isEntry: false,
						code: 'client parent',
						map: null,
						segment: null,
						origPath: null,
					},
					{
						path: '/src/shared.tsx_click_abc.js',
						isEntry: false,
						code: 'export const env = "client";',
						map: null,
						segment: { name: 's_click', ctxName: 'component$' },
						origPath: null,
					},
				],
				diagnostics: [],
				isTypeScript: true,
				isJsx: true,
			})
			.mockResolvedValueOnce({
				modules: [
					{
						path: '/workspace/app/src/shared.tsx',
						isEntry: false,
						code: 'server parent',
						map: null,
						segment: null,
						origPath: null,
					},
					{
						path: '/src/shared.tsx_click_abc.js',
						isEntry: false,
						code: 'export const env = "server";',
						map: null,
						segment: { name: 's_click', ctxName: 'component$' },
						origPath: null,
					},
				],
				diagnostics: [],
				isTypeScript: true,
				isJsx: true,
			});
		const plugin = qwikPlugin(
			(context) => {
				return (context as { environment?: { config?: { consumer?: string } } }).environment
					?.config?.consumer === 'server'
					? 'server'
					: 'client';
			},
			{ dev: true },
		);
		const clientContext = { environment: { config: { consumer: 'client' } } };
		const serverContext = { environment: { config: { consumer: 'server' } } };

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(
			plugin,
			'export default 1;',
			'/workspace/app/src/shared.tsx',
			clientContext,
		);
		await callTransform(
			plugin,
			'export default 1;',
			'/workspace/app/src/shared.tsx',
			serverContext,
		);
		const client = await callResolveId(
			plugin,
			'/src/shared.tsx_click_abc.js',
			undefined,
			clientContext,
		);
		const server = await callResolveId(
			plugin,
			'/src/shared.tsx_click_abc.js',
			undefined,
			serverContext,
		);

		expect(client).toHaveProperty('id', '\0qwik:segment:client:/src/shared.tsx_click_abc.js');
		expect(server).toHaveProperty('id', '\0qwik:segment:server:/src/shared.tsx_click_abc.js');
		expect(await callLoad(plugin, (client as { id: string }).id, clientContext)).toContain(
			'"client"',
		);
		expect(await callLoad(plugin, (server as { id: string }).id, serverContext)).toContain(
			'"server"',
		);
	});

	test('invalidates generated dev segments derived from a parent source', async () => {
		const transformRequest = vi.fn(async () => {
			await callTransform(plugin, 'export default 2;', '/workspace/app/src/home.tsx');
		});
		const plugin = qwikClient({
			dev: true,
			devServer: { environments: { client: { transformRequest } }, transformRequest },
		});
		optimizerMock.transformModules
			.mockResolvedValueOnce({
				modules: [
					{
						path: '/workspace/app/src/home.tsx',
						isEntry: false,
						code: 'parent v1',
						map: null,
						segment: null,
						origPath: null,
					},
					{
						path: '/src/home.tsx_click_abc.js',
						isEntry: false,
						code: 'export const version = "old";',
						map: null,
						segment: { name: 's_click', ctxName: 'component$' },
						origPath: null,
					},
				],
				diagnostics: [],
				isTypeScript: true,
				isJsx: true,
			})
			.mockResolvedValueOnce({
				modules: [
					{
						path: '/workspace/app/src/home.tsx',
						isEntry: false,
						code: 'parent v2',
						map: null,
						segment: null,
						origPath: null,
					},
					{
						path: '/src/home.tsx_click_abc.js',
						isEntry: false,
						code: 'export const version = "new";',
						map: null,
						segment: { name: 's_click', ctxName: 'component$' },
						origPath: null,
					},
				],
				diagnostics: [],
				isTypeScript: true,
				isJsx: true,
			});

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, 'export default 1;', '/workspace/app/src/home.tsx');
		const resolved = await callResolveId(plugin, '/src/home.tsx_click_abc.js');
		expect(await callLoad(plugin, (resolved as { id: string }).id)).toContain('"old"');

		const deleted = (
			plugin as { api: { invalidateDevSegments: typeof vi.fn } }
		).api.invalidateDevSegments('/src/home.tsx', 'client');

		expect(deleted).toContain('\0qwik:segment:client:/src/home.tsx_click_abc.js');
		expect(await callLoad(plugin, (resolved as { id: string }).id)).toContain('"new"');
		expect(transformRequest).toHaveBeenCalledWith('/src/home.tsx');
	});

	test('normalizes dev QRL URL forms to consistent segment identity', async () => {
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
					path: '/workspace/app/src/home.tsx_click_abc.js',
					isEntry: false,
					code: 'export const click = () => "normalized";',
					map: null,
					segment: { name: 's_click', ctxName: 'component$' },
					origPath: null,
				},
			],
			diagnostics: [],
			isTypeScript: true,
			isJsx: true,
		});
		const plugin = qwikClient({ dev: true });
		const requests = [
			'/src/home.tsx_click_abc.js?v=123',
			'/src/home.tsx_click_abc.js',
			'/workspace/app/src/home.tsx_click_abc.js',
			'C:\\workspace\\app\\src\\home.tsx_click_abc.js',
		];

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, 'export default 1;', '/workspace/app/src/home.tsx');

		for (const request of requests) {
			const resolved = await callResolveId(plugin, request);

			expect(await callLoad(plugin, (resolved as { id: string }).id)).toContain(
				'"normalized"',
			);
		}
	});

	test('appends literal self-accept code to non-worker dev QRL segments', async () => {
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
					code: 'export const click = () => "click";',
					map: null,
					segment: { name: 's_click', ctxName: 'component$' },
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
		const code = await callLoad(plugin, (resolved as { id: string }).id);

		expect(code).toContain('export const click = () => "click";');
		expect(code).toContain('import.meta.hot.accept(');
		expect(code).toContain("document.dispatchEvent(new CustomEvent('qHmr'");
		expect(code).toContain('files:["/src/home.tsx"]');
		expect(code).toContain('t:document.__hmrT');
		expect(code).toContain("typeof document !== 'undefined'");
	});

	test('does not append self-accept code to worker dev QRL segments', async () => {
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
					path: '/src/home.tsx_worker_abc.js',
					isEntry: false,
					code: 'export const worker = () => "worker";',
					map: null,
					segment: { name: 's_worker', ctxName: 'worker$' },
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
		const resolved = await callResolveId(plugin, '/src/home.tsx_worker_abc.js');
		const code = await callLoad(plugin, (resolved as { id: string }).id);

		expect(code).toBe('export const worker = () => "worker";');
		expect(code).not.toContain('import.meta.hot.accept(');
		expect(code).not.toContain("typeof document !== 'undefined'");
	});

	test('does not append self-accept code when HMR is disabled', async () => {
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
					code: 'export const click = () => "click";',
					map: null,
					segment: { name: 's_click', ctxName: 'component$' },
					origPath: null,
				},
			],
			diagnostics: [],
			isTypeScript: true,
			isJsx: true,
		});
		const plugin = qwikClient({ dev: true, hmr: false });

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, 'export default 1;', '/workspace/app/src/home.tsx');
		const resolved = await callResolveId(plugin, '/src/home.tsx_click_abc.js');
		const code = await callLoad(plugin, (resolved as { id: string }).id);

		expect(code).toBe('export const click = () => "click";');
		expect(code).not.toContain('import.meta.hot.accept(');
		expect(code).not.toContain("typeof document !== 'undefined'");
	});

	test('transforms dev QRL parents on demand before loading generated code', async () => {
		const transformRequest = vi.fn(async () => {
			await callTransform(plugin, 'export default 1;', '/workspace/app/src/home.tsx');
		});
		const plugin = qwikClient({
			dev: true,
			devServer: { environments: { client: { transformRequest } }, transformRequest },
		});
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
					code: 'export const click = () => "click";',
					map: null,
					segment: { name: 's_click', ctxName: 'component$' },
					origPath: null,
				},
			],
			diagnostics: [],
			isTypeScript: true,
			isJsx: true,
		});

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const resolved = await callResolveId(plugin, '/src/home.tsx_click_abc.js');
		const code = await callLoad(plugin, (resolved as { id: string }).id);

		expect(transformRequest).toHaveBeenCalledWith('/src/home.tsx');
		expect(code).toContain('export const click = () => "click";');
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

function expectTransformModulesNeverCalledWithHmr() {
	for (const [options] of optimizerMock.transformModules.mock.calls) {
		expect(options).not.toEqual(expect.objectContaining({ mode: 'hmr' }));
	}
}
