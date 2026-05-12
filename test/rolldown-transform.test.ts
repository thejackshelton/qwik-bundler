import { createOptimizer } from '@qwik.dev/optimizer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { qwik, qwikClient, qwikLib, qwikServer } from '../src/rolldown';
import { callBuildStart, callTransform } from './helpers';

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

describe('Rolldown optimizer transforms', () => {
	test('defaults qwik() to the client plugin', async () => {
		const plugin = qwik();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = await callTransform(
			plugin,
			"import { component$ } from '@qwik.dev/core'; export const answer = 42;",
			'/workspace/app/src/root.tsx',
		);

		expect(createOptimizer).toHaveBeenCalledWith(undefined);
		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				input: [
					{
						code: "import { component$ } from '@qwik.dev/core'; export const answer = 42;",
						path: '/workspace/app/src/root.tsx',
					},
				],
				rootDir: '/workspace/app',
				srcDir: '/workspace/app',
				isServer: false,
				mode: 'prod',
			}),
		);
		expect(result).toEqual({ code: 'optimized', map: null });
	});

	test('forwards optimizer diagnostics through the plugin context', async () => {
		optimizerMock.transformModules.mockResolvedValueOnce({
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
			diagnostics: [
				{
					scope: 'optimizer',
					category: 'warning',
					code: 'qwik-warning',
					file: 'src/diagnostic.tsx',
					message: 'optimizer warning',
					highlights: [
						{
							hi: 0,
							lo: 0,
							startLine: 4,
							startCol: 2,
							endLine: 4,
							endCol: 8,
						},
					],
					suggestions: null,
				},
				{
					scope: 'optimizer',
					category: 'error',
					code: 'qwik-error',
					file: 'src/diagnostic.tsx',
					message: 'optimizer error',
					highlights: null,
					suggestions: null,
				},
			],
			isTypeScript: true,
			isJsx: true,
		});
		const plugin = qwikClient();
		const warn = vi.fn();
		const error = vi.fn();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(
			plugin,
			"import { component$ } from '@qwik.dev/core'; export default 1;",
			'/workspace/app/src/root.tsx',
			{
				warn,
				error,
			},
		);

		expect(warn).toHaveBeenCalledTimes(1);
		expect(error).toHaveBeenCalledTimes(1);
		const warning = warn.mock.calls[0]?.[0] as Error & {
			id?: string;
			plugin?: string;
			loc?: { line: number; column: number };
		};
		const failure = error.mock.calls[0]?.[0] as Error & { id?: string; plugin?: string };

		expect(warning.message).toBe('optimizer warning');
		expect(warning).toMatchObject({
			id: '/workspace/app/src/root.tsx',
			plugin: 'qwik',
			loc: { line: 4, column: 2 },
		});
		expect(failure.message).toBe('optimizer error');
		expect(failure).toMatchObject({
			id: '/workspace/app/src/root.tsx',
			plugin: 'qwik',
		});
	});

	test('uses server optimizer settings for qwikServer()', async () => {
		const plugin = qwikServer();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(
			plugin,
			"import { renderToString } from '@qwik.dev/core/server'; export default 1;",
			'/workspace/app/src/server.ts',
		);

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				isServer: true,
				mode: 'prod',
				entryStrategy: { type: 'hoist' },
			}),
		);
	});

	test('optimizes plain JavaScript source files', async () => {
		const plugin = qwikClient();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(
			plugin,
			"import { component$ } from '@qwik.dev/core'; export const value = 1;",
			'/workspace/app/src/component.js',
		);

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				input: [expect.objectContaining({ path: '/workspace/app/src/component.js' })],
			}),
		);
	});

	test('skips generated JavaScript without Qwik imports', async () => {
		const plugin = qwikClient();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = await callTransform(
			plugin,
			'globalThis.__qwik = {}; export const runtime = true;',
			'/workspace/app/.nitro/vite/services/ssr/assets/qwik-core.js',
		);

		expect(result).toBeNull();
		expect(optimizerMock.transformModules).not.toHaveBeenCalled();
	});

	test('replaces experimental globals in non-source Qwik modules', async () => {
		const plugin = qwikClient({ experimental: ['suspense'] });

		const result = await callTransform(
			plugin,
			'export const flags = [__EXPERIMENTAL__.suspense, __EXPERIMENTAL__.insights];',
			'/workspace/app/node_modules/@qwik.dev/core/dist/core.mjs',
		);

		expect(result).toEqual({ code: 'export const flags = [true, false];', map: null });
		expect(optimizerMock.transformModules).not.toHaveBeenCalled();
	});

	test('still optimizes Qwik library files in node_modules', async () => {
		const plugin = qwikClient();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(
			plugin,
			'export const library = true;',
			'/workspace/app/node_modules/@fixtures/qwik-lib/lib/index.qwik.mjs',
		);

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				input: [
					expect.objectContaining({
						path: '/workspace/app/node_modules/@fixtures/qwik-lib/lib/index.qwik.mjs',
					}),
				],
			}),
		);
	});

	test('uses library optimizer settings for qwikLib()', async () => {
		const plugin = qwikLib();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(
			plugin,
			"import { component$ } from '@qwik.dev/core'; export default 1;",
			'/workspace/app/src/index.tsx',
		);

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				isServer: false,
				mode: 'lib',
				entryStrategy: { type: 'inline' },
			}),
		);
	});
});
