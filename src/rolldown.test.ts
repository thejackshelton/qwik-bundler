import { createOptimizer } from '@qwik.dev/optimizer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Plugin, RolldownOptions } from 'rolldown';
import { qwik } from './rolldown';

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
	test('infers root and source directories from Rolldown build options', async () => {
		const plugin = qwik();

		callBuildStart(plugin, {
			cwd: '/workspace/app',
			input: ['src/root.tsx'],
		});
		const result = await callTransform(
			plugin,
			'export const answer = 42;',
			'/workspace/app/src/root.tsx',
		);

		expect(createOptimizer).toHaveBeenCalledWith({});
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

	test('uses tsdown library builds for Qwik library transforms', async () => {
		const plugin = qwik();
		const tsdownPlugin = plugin as Plugin & {
			tsdownConfigResolved?: (config: unknown) => void;
		};

		callBuildStart(plugin, {
			cwd: '/workspace/app',
			input: ['src/index.tsx'],
		});
		tsdownPlugin.tsdownConfigResolved?.({});
		await callTransform(plugin, 'export default 1;', '/workspace/app/src/index.tsx');

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: 'lib',
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

		const plugin = qwik();
		callBuildStart(plugin, {
			cwd: '/workspace/app',
			input: ['src/root.tsx'],
		});
		await callTransform(plugin, 'source', '/workspace/app/src/root.tsx');

		const resolvedId = await callResolveId(
			plugin,
			'./root.tsx_root_component_abc.js',
			'/workspace/app/src/root.tsx',
		);

		expect(typeof resolvedId).toBe('string');
		expect(await callLoad(plugin, resolvedId as string)).toEqual({
			code: 'export const s_abc = () => "Hello";',
			map: null,
		});

		const resolve = vi.fn().mockResolvedValue({ id: '/workspace/app/src/home.tsx' });
		expect(await callResolveId(plugin, './home', resolvedId as string, resolve)).toEqual({
			id: '/workspace/app/src/home.tsx',
		});
		expect(resolve).toHaveBeenCalledWith('./home', '/workspace/app/src/root.tsx', {
			skipSelf: true,
		});
	});
});

function callBuildStart(plugin: Plugin, options: { cwd: string; input: RolldownOptions['input'] }) {
	const buildStart = plugin.buildStart;
	if (typeof buildStart === 'function') {
		return buildStart.call({} as never, options as never);
	}
	throw new Error('Expected function buildStart hook');
}

async function callTransform(plugin: Plugin, code: string, id: string) {
	const transform = plugin.transform;
	if (typeof transform === 'function') {
		return transform.call({} as never, code, id, undefined as never);
	}
	if (transform && typeof transform === 'object' && 'handler' in transform) {
		return transform.handler.call({} as never, code, id, undefined as never);
	}
	throw new Error('Expected function transform hook');
}

async function callResolveId(plugin: Plugin, source: string, importer: string, resolve = vi.fn()) {
	const resolveId = plugin.resolveId;
	if (typeof resolveId === 'function') {
		return resolveId.call({ resolve } as never, source, importer, { isEntry: false } as never);
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
