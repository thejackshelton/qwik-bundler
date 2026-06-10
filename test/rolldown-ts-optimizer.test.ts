// Tests for the `tsOptimizer` experimental feature flag that swaps the
// SWC napi optimizer for `qwik-optimizer-ts` and threads Rolldown's
// `meta.ast` into the optimizer call.

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { qwik } from '../src/rolldown';
import { callBuildStart, callTransform } from './helpers';

const swcMock = vi.hoisted(() => ({
	createOptimizer: vi.fn(),
	transformModules: vi.fn(),
}));

const tsMock = vi.hoisted(() => ({
	createOptimizer: vi.fn(),
	transformModules: vi.fn(),
}));

vi.mock('@qwik.dev/optimizer', () => ({
	createOptimizer: swcMock.createOptimizer,
}));

vi.mock('qwik-optimizer-ts', () => ({
	createOptimizer: tsMock.createOptimizer,
}));

function resetMock(mock: typeof swcMock) {
	mock.createOptimizer.mockReset();
	mock.transformModules.mockReset();
	mock.transformModules.mockResolvedValue({
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
	mock.createOptimizer.mockResolvedValue({
		transformModules: mock.transformModules,
		sys: {} as never,
	});
}

beforeEach(() => {
	resetMock(swcMock);
	resetMock(tsMock);
});

const FIXTURE = "import { component$ } from '@qwik.dev/core'; export const x = 1;";

describe('tsOptimizer experimental feature', () => {
	test('defaults to the SWC optimizer when the experimental flag is absent', async () => {
		const plugin = qwik();
		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, FIXTURE, '/workspace/app/src/root.tsx');

		expect(swcMock.createOptimizer).toHaveBeenCalledTimes(1);
		expect(tsMock.createOptimizer).not.toHaveBeenCalled();
	});

	test('uses the SWC optimizer when experimental excludes tsOptimizer', async () => {
		const plugin = qwik({ experimental: ['suspense'] });
		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, FIXTURE, '/workspace/app/src/root.tsx');

		expect(swcMock.createOptimizer).toHaveBeenCalledTimes(1);
		expect(tsMock.createOptimizer).not.toHaveBeenCalled();
	});

	test('swaps to qwik-optimizer-ts when experimental includes tsOptimizer', async () => {
		const plugin = qwik({ experimental: ['tsOptimizer'] });
		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, FIXTURE, '/workspace/app/src/root.tsx');

		expect(tsMock.createOptimizer).toHaveBeenCalledTimes(1);
		expect(swcMock.createOptimizer).not.toHaveBeenCalled();
	});

	test('coexists with other experimental flags', async () => {
		const plugin = qwik({ experimental: ['suspense', 'tsOptimizer', 'webWorker'] });
		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, FIXTURE, '/workspace/app/src/root.tsx');

		expect(tsMock.createOptimizer).toHaveBeenCalledTimes(1);
		expect(swcMock.createOptimizer).not.toHaveBeenCalled();
	});

	test('forwards meta.ast into transformOptions.input[0].program for TS mode', async () => {
		const fakeAst = { type: 'Program', body: [], sourceType: 'module' };
		const plugin = qwik({ experimental: ['tsOptimizer'] });
		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, FIXTURE, '/workspace/app/src/root.tsx', {}, { ast: fakeAst });

		expect(tsMock.transformModules).toHaveBeenCalledTimes(1);
		const opts = tsMock.transformModules.mock.calls[0]![0];
		expect(opts.input[0].program).toBe(fakeAst);
	});

	test('omits program when meta.ast is undefined (no host parse available)', async () => {
		const plugin = qwik({ experimental: ['tsOptimizer'] });
		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, FIXTURE, '/workspace/app/src/root.tsx', {}, undefined);

		expect(tsMock.transformModules).toHaveBeenCalledTimes(1);
		const opts = tsMock.transformModules.mock.calls[0]![0];
		expect(opts.input[0]).not.toHaveProperty('program');
	});

	test('forwards meta.ast into the SWC path as well — SWC ignores extra fields', async () => {
		// SWC re-parses internally so the field is a harmless no-op there.
		// Threading it from the same call site keeps the dispatch uniform.
		const fakeAst = { type: 'Program', body: [], sourceType: 'module' };
		const plugin = qwik();
		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, FIXTURE, '/workspace/app/src/root.tsx', {}, { ast: fakeAst });

		expect(swcMock.transformModules).toHaveBeenCalledTimes(1);
		const opts = swcMock.transformModules.mock.calls[0]![0];
		expect(opts.input[0].program).toBe(fakeAst);
	});

	test('memoises the optimizer instance across multiple transform calls', async () => {
		const plugin = qwik({ experimental: ['tsOptimizer'] });
		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callTransform(plugin, FIXTURE, '/workspace/app/src/a.tsx');
		await callTransform(plugin, FIXTURE, '/workspace/app/src/b.tsx');

		expect(tsMock.createOptimizer).toHaveBeenCalledTimes(1);
	});
});
