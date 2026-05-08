import { createOptimizer } from '@qwik.dev/optimizer';
import type { Plugin } from 'vite';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { QwikManifest } from '../src/build/manifest';
import { qwik } from '../src/vite';
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
			'export default 1;',
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
			'export default 1;',
			'/workspace/app/src/root.tsx',
			createViteHookContext('client', { lib: { entry: 'src/index.tsx' } }),
		);

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
		await callTransform(
			plugin,
			'source',
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
});

function getQwikPlugin() {
	return getPlugin(qwik() as Plugin[], 'vite-plugin-qwik');
}
