import type { Optimizer } from '@qwik.dev/optimizer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { buildQwik } from './build-qwik';
import type { Bundler } from './types';

const mockCreateOptimizer = vi.hoisted(() => vi.fn());

vi.mock('@qwik.dev/optimizer', () => ({
	createOptimizer: mockCreateOptimizer,
}));

beforeEach(() => {
	mockCreateOptimizer.mockReset();
});

describe('buildQwik', () => {
	test('creates the optimizer and desugars entry for the bundler', async () => {
		const transformModules = vi.fn(async () => ({
			modules: [],
			diagnostics: [],
			isTypeScript: true,
			isJsx: true,
		}));
		mockCreateOptimizer.mockResolvedValue(createOptimizer(transformModules));
		const bundler = vi.fn(async (request) => {
			await request.transformModules({
				input: [{ code: 'export default 1', path: './src/root.tsx' }],
				srcDir: '',
			});
			return {
				ok: true,
				entries: request.entries,
				environment: request.environment,
			};
		}) satisfies Bundler<{ ok: boolean; entries: unknown; environment: unknown }>;

		const result = await buildQwik({
			entry: './src/root.tsx',
			bundler,
		});

		expect(mockCreateOptimizer).toHaveBeenCalledWith({});
		expect(bundler).toHaveBeenCalledOnce();
		expect(bundler).toHaveBeenCalledWith({
			entries: { client: './src/root.tsx' },
			environment: 'client',
			transformModules: expect.any(Function),
		});
		expect(transformModules).toHaveBeenCalledOnce();
		expect(result.entries).toEqual({ client: './src/root.tsx' });
		expect(result.environment).toBe('client');
		expect(result).not.toHaveProperty('optimizer');
		expect(result.output).toEqual({
			ok: true,
			entries: { client: './src/root.tsx' },
			environment: 'client',
		});
	});

	test('passes integration-provided entries through unchanged', async () => {
		mockCreateOptimizer.mockResolvedValue(createOptimizer(vi.fn()));
		const entries = {
			client: {
				cmpA: './src/a.tsx',
				cmpB: './src/b.tsx',
			},
			server: './src/entry.ssr.tsx',
		};
		const result = await buildQwik({
			entries,
			environment: 'server',
			bundler: async (request) => request.entries,
		});

		expect(result.entries).toBe(entries);
		expect(result.environment).toBe('server');
		expect(result.output).toBe(entries);
	});

	test('rejects ambiguous entry configuration before creating the optimizer', async () => {
		await expect(() =>
			buildQwik({
				entry: './src/root.tsx',
				entries: { client: './src/other.tsx' },
				bundler: async () => undefined,
			}),
		).rejects.toThrow('either "entry" or "entries"');
		expect(mockCreateOptimizer).not.toHaveBeenCalled();
	});
});

function createOptimizer(transformModules: Optimizer['transformModules']): Optimizer {
	return {
		transformModules,
		sys: {} as never,
	};
}
