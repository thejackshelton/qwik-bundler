import { createOptimizer } from '@qwik.dev/optimizer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Plugin, ResolvedConfig } from 'vite';
import { qwik } from './vite';

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

describe('Vite plugin', () => {
	test('infers root and source directories from Vite config', async () => {
		const plugin = qwik();

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
		);

		expect(createOptimizer).toHaveBeenCalledWith({});
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
		const plugin = qwik();

		callConfigResolved(plugin, {
			root: '/workspace/app',
			build: {
				rolldownOptions: { input: 'src/root.tsx' },
				rollupOptions: {},
			},
		});
		await callTransform(plugin, 'export default 1;', '/workspace/app/src/root.tsx', 'server');

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				isServer: true,
			}),
		);
	});

	test('does not force non-server environments to client', async () => {
		const plugin = qwik({ environment: 'lib' });

		callConfigResolved(plugin, {
			root: '/workspace/app',
			build: {
				rolldownOptions: { input: 'src/root.tsx' },
				rollupOptions: {},
			},
		});
		await callTransform(plugin, 'export default 1;', '/workspace/app/src/root.tsx', 'client');

		expect(optimizerMock.transformModules).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: 'lib',
			}),
		);
	});

	test('injects and serves the Vite HMR bridge in dev', async () => {
		const plugin = qwik();

		callConfigResolved(plugin, {
			command: 'serve',
			root: '/workspace/app',
			build: {
				rolldownOptions: {},
				rollupOptions: {},
			},
		});

		expect(callTransformIndexHtml(plugin)).toEqual([
			expect.objectContaining({
				tag: 'script',
				children: expect.stringContaining('@qwik-hmr-bridge'),
			}),
		]);
		expect(await callResolveId(plugin, '@qwik-hmr-bridge')).toBe('\0@qwik-hmr-bridge');
		expect(await callLoad(plugin, '\0@qwik-hmr-bridge')).toContain('qwik:hmr');
	});

	test('forwards SSR module updates to the client HMR bridge', () => {
		const plugin = qwik();
		const send = vi.fn();

		callHotUpdate(
			plugin,
			{
				environment: { config: { consumer: 'server' } },
			},
			{
				modules: [{ url: '/src/root.tsx?v=123', importers: new Set(), type: 'js' }],
				server: {
					environments: {
						client: {
							hot: { send },
						},
					},
				},
				timestamp: 123,
			},
		);

		expect(send).toHaveBeenCalledWith({
			type: 'custom',
			event: 'qwik:hmr',
			data: { files: ['/src/root.tsx'], t: 123 },
		});
	});
});

function callConfigResolved(plugin: Plugin, config: unknown) {
	const configResolved = plugin.configResolved;
	if (typeof configResolved === 'function') {
		return configResolved.call({} as never, config as ResolvedConfig);
	}
	throw new Error('Expected function configResolved hook');
}

async function callTransform(
	plugin: Plugin,
	code: string,
	id: string,
	consumer: 'client' | 'server' = 'client',
) {
	const transform = plugin.transform;
	const context = {
		environment: { config: { consumer } },
	};
	if (typeof transform === 'function') {
		return transform.call(context as never, code, id, undefined as never);
	}
	if (transform && typeof transform === 'object' && 'handler' in transform) {
		return transform.handler.call(context as never, code, id, undefined as never);
	}
	throw new Error('Expected function transform hook');
}

function callTransformIndexHtml(plugin: Plugin) {
	const transformIndexHtml = plugin.transformIndexHtml;
	if (typeof transformIndexHtml === 'function') {
		return transformIndexHtml.call({} as never, '', {} as never);
	}
	throw new Error('Expected function transformIndexHtml hook');
}

async function callResolveId(plugin: Plugin, id: string) {
	const resolveId = plugin.resolveId;
	if (typeof resolveId === 'function') {
		return resolveId.call({} as never, id, undefined, { isEntry: false } as never);
	}
	throw new Error('Expected function resolveId hook');
}

async function callLoad(plugin: Plugin, id: string) {
	const load = plugin.load;
	if (typeof load === 'function') {
		return load.call({} as never, id, undefined as never);
	}
	throw new Error('Expected function load hook');
}

function callHotUpdate(plugin: Plugin, context: unknown, options: unknown) {
	const hotUpdate = plugin.hotUpdate;
	if (typeof hotUpdate === 'function') {
		return hotUpdate.call(context as never, options as never);
	}
	throw new Error('Expected function hotUpdate hook');
}
