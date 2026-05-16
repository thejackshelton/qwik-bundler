import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'pathe';
import { createBuilder, type Plugin, type UserConfig } from 'vite';
import { describe, expect, test, vi } from 'vitest';
import { qwik } from '../src/vite/index';
import { callConfig, callResolveId, createViteHookContext, getPlugin } from './helpers';

const root = resolve(import.meta.dirname, '..');
const denoFixtureRoot = resolve(root, 'fixtures/vite-deno-workspace');

describe('Vite Node and Deno externalization integration', () => {
	test('keeps Node-resolved Qwik library output inside the Vite pipeline', async () => {
		const plugin = getQwikPlugin();
		const resolve = vi.fn(async () => ({
			id: '/workspace/app/node_modules/@fixtures/qwik-lib/lib/index.qwik.mjs',
			external: true,
		}));

		const resolved = await callResolveId(plugin, '@fixtures/qwik-lib', '/workspace/app.tsx', {
			...createViteHookContext('server'),
			resolve,
		});

		expect(resolved).toEqual({
			id: '/workspace/app/node_modules/@fixtures/qwik-lib/lib/index.qwik.mjs',
			external: false,
		});
	});

	test('keeps Deno-resolved Qwik library output inside the Vite pipeline', async () => {
		const root = await mkdtemp(join(tmpdir(), 'qwik-bundler-deno-'));
		await writeFile(
			join(root, 'deno.json'),
			JSON.stringify({
				imports: {
					'@fixtures/qwik-lib': 'npm:@fixtures/qwik-lib@1.0.0',
					react: 'npm:react@19.0.0',
				},
			}),
		);

		const plugin = getQwikPlugin();
		const config: UserConfig = { root };

		expect(
			callConfig(plugin, config, { command: 'serve', mode: 'development' }),
		).toBeUndefined();

		const resolve = vi.fn(async () => ({
			id: 'npm:@fixtures/qwik-lib@1.0.0/lib/index.qwik.mjs',
			external: true,
		}));
		const resolved = await callResolveId(plugin, '@fixtures/qwik-lib', '/workspace/app.tsx', {
			...createViteHookContext('server'),
			resolve,
		});

		expect(resolve).toHaveBeenCalledWith('@fixtures/qwik-lib', '/workspace/app.tsx', {
			isEntry: false,
			skipSelf: true,
		});
		expect(resolved).toEqual({
			id: 'npm:@fixtures/qwik-lib@1.0.0/lib/index.qwik.mjs',
			external: false,
		});
	});

	test('leaves non-Qwik Deno-resolved dependencies externalized', async () => {
		const plugin = getQwikPlugin();
		const resolve = vi.fn(async () => ({
			id: 'npm:react@19.0.0/index.js',
			external: true,
		}));

		const resolved = await callResolveId(plugin, 'react', '/workspace/app.tsx', {
			...createViteHookContext('server'),
			resolve,
		});

		expect(resolve).toHaveBeenCalledWith('react', '/workspace/app.tsx', {
			isEntry: false,
			skipSelf: true,
		});
		expect(resolved).toBeNull();
	});

	test('does not run the Deno external fallback in client environments', async () => {
		const plugin = getQwikPlugin();
		const resolve = vi.fn(async () => ({
			id: 'npm:@fixtures/qwik-lib@1.0.0/lib/index.qwik.mjs',
			external: true,
		}));

		const resolved = await callResolveId(plugin, '@fixtures/qwik-lib', '/workspace/app.tsx', {
			...createViteHookContext('client'),
			resolve,
		});

		expect(resolve).not.toHaveBeenCalled();
		expect(resolved).toBeNull();
	});

	test('runs the Deno external fallback in custom server-like environments', async () => {
		const plugin = getQwikPlugin();
		const resolve = vi.fn(async () => ({
			id: 'npm:@fixtures/qwik-lib@1.0.0/lib/index.qwik.mjs',
			external: true,
		}));

		const resolved = await callResolveId(plugin, '@fixtures/qwik-lib', '/workspace/app.tsx', {
			environment: { name: 'deno', config: {} },
			resolve,
		});

		expect(resolved).toEqual({
			id: 'npm:@fixtures/qwik-lib@1.0.0/lib/index.qwik.mjs',
			external: false,
		});
	});

	test('keeps Qwik core runtime imports inside the server pipeline', async () => {
		const plugin = getQwikPlugin();
		const resolve = vi.fn(async () => ({
			id: '/workspace/node_modules/@qwik.dev/core/dist/core.prod.mjs',
			external: true,
		}));

		const resolved = await callResolveId(plugin, '@qwik.dev/core', '/workspace/app.tsx', {
			...createViteHookContext('server'),
			resolve,
		});

		expect(resolved).toEqual({
			id: '/workspace/node_modules/@qwik.dev/core/dist/core.prod.mjs',
			external: false,
		});
	});

	test('fixture is a Deno-native workspace with no app package.json', async () => {
		const workspace = await readJson<{
			workspace: string[];
			compilerOptions: Record<string, unknown>;
			imports: Record<string, string>;
		}>(resolve(denoFixtureRoot, 'deno.json'));
		const app = await readJson<{ compilerOptions: Record<string, unknown> }>(
			resolve(denoFixtureRoot, 'app/deno.json'),
		);
		const tsconfig = await readJson<{ compilerOptions: Record<string, unknown> }>(
			resolve(denoFixtureRoot, 'app/tsconfig.json'),
		);
		const library = await readJson<{ name: string; exports: { '.': string } }>(
			resolve(denoFixtureRoot, 'qwik-lib/deno.json'),
		);

		await expect(stat(resolve(denoFixtureRoot, 'app/package.json'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
		await expect(stat(resolve(denoFixtureRoot, 'app/src/main.tsx'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
		await expect(stat(resolve(denoFixtureRoot, 'app/index.html'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
		await expect(stat(resolve(denoFixtureRoot, 'app/src/client.ts'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
		await expect(stat(resolve(denoFixtureRoot, 'app/dev.ts'))).rejects.toMatchObject({
			code: 'ENOENT',
		});
		const viteConfig = await readFile(resolve(denoFixtureRoot, 'app/vite.config.ts'), 'utf8');
		expect(viteConfig).toContain('Fixture-only');
		expect(viteConfig).toContain('meta-framework');
		expect(viteConfig).toContain('qwik(),');
		expect(viteConfig).toContain('ssrLoadModule');
		expect(viteConfig).toContain('transformIndexHtml');
		expect(viteConfig).toContain('__qwik');
		expect(viteConfig).not.toContain('appType');
		expect(viteConfig).not.toContain('createFetchableDevEnvironment');
		expect(viteConfig).not.toContain('createServerModuleRunner');
		expect(viteConfig).not.toContain('dispatchFetch');
		expect(viteConfig).not.toContain('...qwik');
		expect(viteConfig).not.toContain('srvx/node');
		expect(viteConfig).not.toContain('node:');
		expect(viteConfig).not.toContain('Deno.serve');
		expect(workspace.workspace).toEqual(['./app', './qwik-lib', './qwik-bundler']);
		expect(workspace.compilerOptions).toMatchObject({
			jsx: 'react-jsx',
			jsxImportSource: '@qwik.dev/core',
			jsxImportSourceTypes: '@qwik.dev/core',
		});
		expect(workspace.imports).toMatchObject({
			'@qwik.dev/core': 'npm:@qwik.dev/core@2.0.0-beta.35',
			'@qwik.dev/core/jsx-runtime': 'npm:@qwik.dev/core@2.0.0-beta.35/jsx-runtime',
			'@qwik.dev/core/server': 'npm:@qwik.dev/core@2.0.0-beta.35/server',
			'@types/deno': 'npm:@types/deno@2.3.0',
		});
		expect(workspace.imports).not.toHaveProperty('@qwik.dev/core/');
		expect(app.compilerOptions).toMatchObject({
			jsx: 'react-jsx',
			jsxImportSource: '@qwik.dev/core',
			jsxImportSourceTypes: '@qwik.dev/core',
		});
		expect(tsconfig.compilerOptions).toMatchObject({
			allowJs: true,
			jsx: 'react-jsx',
			jsxImportSource: '@qwik.dev/core',
			paths: {
				'@qwik.dev/bundler/vite': ['../qwik-bundler/dist/vite/index.mjs'],
			},
			types: ['@types/deno'],
		});
		expect(library).toMatchObject({
			name: '@fixtures/deno-qwik-lib',
			exports: { '.': './lib/index.qwik.mjs' },
		});
	});

	test('builds a Deno workspace app that consumes a local Qwik package', async () => {
		const appRoot = resolve(denoFixtureRoot, 'app');
		const outDir = resolve(appRoot, 'dist');
		await rm(outDir, { force: true, recursive: true });

		try {
			const builder = await createBuilder({
				root: appRoot,
				configFile: false,
				logLevel: 'silent',
				plugins: [await denoWorkspaceResolver(), qwik()],
				esbuild: {
					jsx: 'automatic',
					jsxImportSource: '@qwik.dev/core',
				},
				builder: {},
				environments: {
					client: {
						consumer: 'client',
						build: {
							outDir: 'dist/client',
							rolldownOptions: {
								input: 'src/root.tsx',
							},
						},
					},
					ssr: {
						consumer: 'server',
						build: {
							outDir: 'dist/ssr',
							rolldownOptions: {
								input: 'src/entry.ssr.tsx',
								output: { entryFileNames: 'entry.ssr.mjs' },
							},
						},
					},
				},
			});
			await builder.build(builder.environments.client!);
			await builder.build(builder.environments.ssr!);

			const serverCode = await readFile(resolve(outDir, 'ssr/entry.ssr.mjs'), 'utf8');
			expect(serverCode).toContain('Deno workspace badge');
			expect(serverCode).not.toMatch(/from\s+['"]@fixtures\/deno-qwik-lib['"]/);
		} finally {
			await rm(outDir, { force: true, recursive: true });
		}
	}, 120_000);
});

function getQwikPlugin(options?: Parameters<typeof qwik>[0]) {
	return getPlugin(qwik(options) as Plugin[], 'vite-plugin-qwik');
}

async function denoWorkspaceResolver(): Promise<Plugin> {
	const packages = await denoWorkspacePackages();
	return {
		name: 'fixture:deno-workspace-resolution',
		enforce: 'pre',
		resolveId(source) {
			const workspacePackage = packages.get(source);
			if (workspacePackage) {
				return workspacePackage;
			}

			return resolveQwikCore(source);
		},
	};
}

async function denoWorkspacePackages() {
	const workspace = await readJson<{ workspace: string[] }>(
		resolve(denoFixtureRoot, 'deno.json'),
	);
	const packages = new Map<string, string>();

	for (const member of workspace.workspace) {
		const memberRoot = resolve(denoFixtureRoot, member);
		const config = await readWorkspaceConfig(memberRoot);
		if (!config.name || !config.exports) {
			continue;
		}

		for (const [subpath, entry] of workspaceExports(config.exports)) {
			const name = subpath === '.' ? config.name : `${config.name}/${subpath.slice(2)}`;
			packages.set(name, resolve(memberRoot, entry));
		}
	}

	return packages;
}

async function readWorkspaceConfig(memberRoot: string) {
	type WorkspaceConfig = {
		name?: string;
		exports?: string | Record<string, string | { import?: string; default?: string }>;
	};
	try {
		return await readJson<WorkspaceConfig>(resolve(memberRoot, 'deno.json'));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw error;
		}
		return readJson<WorkspaceConfig>(resolve(memberRoot, 'package.json'));
	}
}

function workspaceExports(
	exports: string | Record<string, string | { import?: string; default?: string }>,
) {
	if (typeof exports === 'string') {
		return [['.', exports]] as const;
	}

	return Object.entries(exports).flatMap(([subpath, entry]) => {
		const value = typeof entry === 'string' ? entry : (entry.import ?? entry.default);
		return value ? [[subpath, value] as const] : [];
	});
}

function resolveQwikCore(source: string) {
	const require = createRequire(import.meta.url);
	const corePackage = require.resolve('@qwik.dev/core/package.json', {
		paths: [resolve(root, 'fixtures/rolldown-library-consumer')],
	});
	const coreRoot = dirname(corePackage);
	const coreDist = resolve(coreRoot, 'dist');

	switch (source) {
		case '@qwik.dev/core':
		case '@qwik.dev/core/internal':
		case '@qwik.dev/core/jsx-runtime':
			return resolve(coreDist, 'core.prod.mjs');
		case '@qwik.dev/core/jsx-dev-runtime':
			return resolve(coreDist, 'core.mjs');
		case '@qwik.dev/core/server':
			return resolve(coreDist, 'server.prod.mjs');
		case '@qwik.dev/core/build':
			return resolve(coreDist, 'build/index.prod.mjs');
		case '@qwik.dev/core/preloader':
			return resolve(coreDist, 'preloader.mjs');
		case '@qwik.dev/core/qwikloader.js':
			return resolve(coreDist, 'qwikloader.js');
		case '@qwik.dev/core/handlers.mjs':
			return resolve(coreRoot, 'handlers.mjs');
		default:
			return null;
	}
}

async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, 'utf8')) as T;
}
