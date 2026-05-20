import type { EnvironmentOptions, Plugin, UserConfig } from 'vite';
import { describe, expect, test, vi } from 'vitest';
import { transformQwikRequest } from '../src/vite/environment';
import { qwik } from '../src/vite/index';
import {
	callConfig,
	callBuildApp,
	callConfigEnvironment,
	callOutputOptions,
	createViteHookContext,
	getPlugin,
} from './helpers';

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
		});
		expect(config.build!.rolldownOptions!.output).toBeUndefined();
		expect(config.build!.modulePreload).toBe(false);
	});

	test('sets output defaults on the Vite client environment only', async () => {
		const plugin = getQwikPlugin();
		const clientConfig: EnvironmentOptions = {
			build: {
				rolldownOptions: {
					output: { dir: 'dist/client' },
				},
			},
		};
		const workerConfig: EnvironmentOptions = {
			build: {
				rolldownOptions: {
					output: { dir: 'dist/worker' },
				},
			},
		};

		expect(callConfigEnvironment(plugin, 'client', clientConfig)).toMatchObject({
			build: {
				rolldownOptions: {
					output: {
						dir: 'dist/client',
						entryFileNames: 'build/q-[hash].js',
						chunkFileNames: 'build/q-[hash].js',
						hoistTransitiveImports: false,
					},
				},
			},
		});
		expect(callConfigEnvironment(plugin, 'vite_workerd_fixture', workerConfig)).toEqual({
			resolve: { noExternal: ['@qwik.dev/core', '@builder.io/qwik'] },
		});
	});

	test('does not rebuild the client environment after Qwik prebuilds it', async () => {
		const plugin = getQwikPlugin();
		const client = { name: 'client', isBuilt: false };
		const build = vi.fn(async (environment: typeof client) => {
			environment.isBuilt = true;
			return [];
		});
		const builder = {
			environments: { client },
			build,
		};

		await callBuildApp(plugin, builder);
		await builder.build(client);

		expect(build).toHaveBeenCalledTimes(1);
	});

	test('adds only built-in Qwik runtime externalization defaults', async () => {
		const plugin = getQwikPlugin();
		const config: UserConfig = { root: '/workspace/app' };

		const result = await callConfig(plugin, config, {
			command: 'serve',
			mode: 'development',
		});

		expect(result).toBeUndefined();

		const environmentConfig: EnvironmentOptions = {
			resolve: { noExternal: ['existing'] },
		};
		const environmentResult = callConfigEnvironment(plugin, 'ssr', environmentConfig);

		expect(environmentResult).toEqual({
			resolve: { noExternal: ['existing', '@qwik.dev/core', '@builder.io/qwik'] },
		});

		const noExternalAllConfig: EnvironmentOptions = { resolve: { noExternal: true } };
		expect(callConfigEnvironment(plugin, 'ssr', noExternalAllConfig)).toBeUndefined();
	});

	test('excludes Qwik runtime from dev dependency optimization', async () => {
		const plugin = getQwikPlugin();
		const config: UserConfig = {
			optimizeDeps: { exclude: ['existing'] },
		};

		await callConfig(plugin, config, { command: 'serve', mode: 'development' });

		expect(config.optimizeDeps).toMatchObject({
			exclude: [
				'existing',
				'@qwik.dev/core',
				'@qwik.dev/core/internal',
				'@qwik.dev/core/server',
				'@qwik.dev/core/jsx-runtime',
				'@qwik.dev/core/jsx-dev-runtime',
				'@qwik.dev/core/build',
				'@qwik.dev/core/loader',
				'@qwik.dev/core/preloader',
				'@builder.io/qwik',
			],
			rolldownOptions: {
				transform: {
					jsx: {
						runtime: 'automatic',
						importSource: '@qwik.dev/core',
					},
				},
			},
		});
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

	test('maps Qwik dev transforms through configured Vite environments', async () => {
		const app = vi.fn(async () => 'client result');
		const worker = vi.fn(async () => 'server result');
		const server = {
			environments: {
				app: { transformRequest: app },
				worker: { transformRequest: worker },
			},
		};
		const options = { clientEnvironment: 'app', serverEnvironment: 'worker' };

		await expect(
			transformQwikRequest(server as never, '/src/root.tsx', 'client', options),
		).resolves.toBe('client result');
		await expect(
			transformQwikRequest(server as never, '/src/entry.ssr.tsx', 'server', options),
		).resolves.toBe('server result');

		expect(app).toHaveBeenCalledWith('/src/root.tsx');
		expect(worker).toHaveBeenCalledWith('/src/entry.ssr.tsx');
	});
});

function getQwikPlugin(options?: Parameters<typeof qwik>[0]) {
	return getPlugin(qwik(options) as Plugin[], 'vite-plugin-qwik');
}
