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
