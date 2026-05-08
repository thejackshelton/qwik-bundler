import type { EnvironmentOptions, Plugin, UserConfig } from 'vite';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { qwik } from '../src/vite';
import {
	callConfig,
	callConfigEnvironment,
	callOutputOptions,
	createViteHookContext,
	getPlugin,
} from './helpers';

const vitefuMock = vi.hoisted(() => ({
	crawlFrameworkPkgs: vi.fn(),
}));

vi.mock('vitefu', () => ({
	crawlFrameworkPkgs: vitefuMock.crawlFrameworkPkgs,
}));

beforeEach(() => {
	vitefuMock.crawlFrameworkPkgs.mockReset();
	vitefuMock.crawlFrameworkPkgs.mockResolvedValue({
		optimizeDeps: { include: [], exclude: [] },
		ssr: { noExternal: [], external: [] },
	});
});

describe('Vite config integration', () => {
	test('sets Vite config defaults for app builds', async () => {
		const plugin = getQwikPlugin();
		const config: UserConfig = {
			build: {
				rolldownOptions: {
					external: ['external-dependency'],
				},
			},
		};

		await callConfig(plugin, config, { command: 'build', mode: 'production' });

		expect(config.build!.rolldownOptions).toMatchObject({
			external: ['external-dependency'],
			output: {
				entryFileNames: 'build/q-[hash].js',
				chunkFileNames: 'build/q-[hash].js',
				hoistTransitiveImports: false,
			},
		});
		expect(config.build!.modulePreload).toBe(false);
	});

	test('uses vitefu to exclude Qwik deps from optimization and SSR externalization', async () => {
		vitefuMock.crawlFrameworkPkgs.mockResolvedValueOnce({
			optimizeDeps: { include: [], exclude: ['@fixtures/qwik-lib'] },
			ssr: { noExternal: ['@fixtures/qwik-lib'], external: [] },
		});
		const plugin = getQwikPlugin();
		const config: UserConfig = { root: '/workspace/app' };

		const result = await callConfig(plugin, config, {
			command: 'serve',
			mode: 'development',
		});

		expect(result).toEqual({
			optimizeDeps: { include: [], exclude: ['@fixtures/qwik-lib'] },
			ssr: { noExternal: ['@fixtures/qwik-lib'], external: [] },
		});
		expect(vitefuMock.crawlFrameworkPkgs).toHaveBeenCalledWith(
			expect.objectContaining({
				root: '/workspace/app',
				isBuild: false,
				viteUserConfig: config,
			}),
		);

		const [crawlOptions] = vitefuMock.crawlFrameworkPkgs.mock.calls[0] ?? [];
		if (!crawlOptions) {
			throw new Error('Expected crawlFrameworkPkgs options');
		}
		expect(crawlOptions.isFrameworkPkgByJson({ qwik: './lib/index.qwik.mjs' })).toBe(true);
		expect(
			crawlOptions.isFrameworkPkgByJson({ peerDependencies: { '@qwik.dev/core': '^2.0.0' } }),
		).toBe(true);
		expect(crawlOptions.isFrameworkPkgByJson({ dependencies: { plain: '1.0.0' } })).toBe(false);

		const environmentConfig: EnvironmentOptions = {
			resolve: { noExternal: ['existing'] },
		};
		const environmentResult = callConfigEnvironment(plugin, 'ssr', environmentConfig);

		expect(environmentResult).toEqual({
			resolve: { noExternal: ['existing', '@fixtures/qwik-lib'] },
		});
		expect(
			callConfigEnvironment(plugin, 'ssr', {
				resolve: { noExternal: ['existing', '@fixtures/qwik-lib'] },
			}),
		).toBeUndefined();
		expect(
			callConfigEnvironment(plugin, 'ssr', { resolve: { noExternal: true } }),
		).toBeUndefined();
	});

	test('dispatches output defaults by Vite environment context', () => {
		const plugin = getQwikPlugin();
		const clientOutput = callOutputOptions(
			plugin,
			{ dir: 'dist' },
			createViteHookContext(),
		) as {
			codeSplitting?: { groups?: Array<{ name: string }> };
		};

		expect(clientOutput).toMatchObject({
			dir: 'dist',
			entryFileNames: 'build/q-[hash].js',
			chunkFileNames: 'build/q-[hash].js',
			hoistTransitiveImports: false,
		});
		expect(clientOutput.codeSplitting?.groups?.map((group) => group.name)).toEqual([
			'qwik-core',
			'qwik-loader',
			'qwik-preloader',
		]);
		expect(
			callOutputOptions(plugin, { dir: 'server' }, createViteHookContext('server')),
		).toMatchObject({
			dir: 'server',
			chunkFileNames: 'q-[hash].js',
			hoistTransitiveImports: false,
			codeSplitting: {
				includeDependenciesRecursively: false,
			},
		});
		expect(
			callOutputOptions(
				plugin,
				{ entryFileNames: '[name].js' },
				createViteHookContext('client', { lib: true }),
			),
		).toEqual({
			entryFileNames: '[name].js',
		});
	});

	test('keeps Vite library config output under host control', async () => {
		const plugin = getQwikPlugin();
		const config: UserConfig = {
			build: {
				lib: { entry: 'src/index.tsx' },
				rolldownOptions: {},
			},
		};

		await callConfig(plugin, config, { command: 'build', mode: 'production' });

		expect(config.build!.rolldownOptions!.output).toBeUndefined();
	});
});

function getQwikPlugin() {
	return getPlugin(qwik() as Plugin[], 'vite-plugin-qwik');
}
