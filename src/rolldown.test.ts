import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Plugin, RolldownOptions } from 'rolldown';
import type { Optimizer } from '@qwik.dev/optimizer';
import { buildQwik } from './build-qwik';
import { qwikRolldownPlugin, rolldown, type RolldownApi } from './rolldown';
import type { BuildRequest } from './types';

const mockCreateOptimizer = vi.hoisted(() => vi.fn());

vi.mock('@qwik.dev/optimizer', () => ({
	createOptimizer: mockCreateOptimizer,
}));

beforeEach(() => {
	mockCreateOptimizer.mockReset();
});

describe('qwikRolldownPlugin', () => {
	test('transforms source through the Qwik build request optimizer', async () => {
		const request = createRequest();
		const plugin = qwikRolldownPlugin(request, { srcDir: 'src' });
		const result = await callTransform(plugin, 'export const answer = 42;', './src/root.tsx');

		expect(request.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				input: [{ code: 'export const answer = 42;', path: './src/root.tsx' }],
				srcDir: 'src',
			}),
		);
		expect(result).toEqual({ code: 'optimized', map: null });
	});
});

describe('rolldown bundler', () => {
	test('is consumed by buildQwik and installs the Qwik plugin', async () => {
		mockCreateOptimizer.mockResolvedValue(createOptimizer());
		let capturedConfig: RolldownOptions | undefined;
		const fakeRolldown: RolldownApi = {
			rolldown: vi.fn(async (config) => {
				capturedConfig = config;
				const transformResult = await callTransform(
					config.plugins![0] as Plugin,
					'export default 1;',
					'./src/root.tsx',
				);

				return {
					write: vi.fn(async (output) => ({ output, transformResult })),
				};
			}),
		};

		const result = await buildQwik({
			entry: './src/root.tsx',
			bundler: rolldown({
				rolldown: fakeRolldown,
				output: { dir: 'dist' },
			}),
		});

		expect(capturedConfig?.input).toBe('./src/root.tsx');
		expect(capturedConfig?.plugins).toHaveLength(1);
		expect(result.output).toEqual({
			output: { dir: 'dist' },
			transformResult: { code: 'optimized', map: null },
		});
	});
});

function createRequest(): BuildRequest {
	const optimizer = createOptimizer();
	return {
		entries: { client: ['./src/root.tsx'] },
		environment: 'client',
		transformModules: optimizer.transformModules,
	};
}

function createOptimizer(): Optimizer {
	return {
		transformModules: vi.fn(async () => ({
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
		})),
		sys: {} as never,
	};
}

async function callTransform(plugin: Plugin, code: string, id: string) {
	const transform = plugin.transform;
	if (typeof transform === 'function') {
		return transform.call({} as never, code, id, {} as never);
	}
	throw new Error('Expected function transform hook');
}
