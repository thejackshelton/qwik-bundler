import { join, resolve } from 'pathe';
import type { PluginOption, ResolvedConfig, ViteBuilder } from 'vite';
import type { BuiltRouterRoute, QwikRouterPlugin } from '../../router/vite/types.ts';

const QWIK_SSG_ENTRY_ID = '@qwik-ssg-entry';
const QWIK_SSG_ENTRY_RESOLVED = '\0@qwik-ssg-entry';

export function staticAdapter(options: StaticAdapterOptions): PluginOption[] {
	return ssgAdapter(options);
}

export function ssgAdapter(options: StaticAdapterOptions): PluginOption[] {
	let adapterConfig: StaticAdapterConfig | undefined;
	let router: QwikRouterPlugin | undefined;
	const outputEntries: string[] = [];
	const ssg = createSsgOptions(options);

	return [
		{
			name: 'vite-plugin-qwik-router-ssg-static-site-generation',
			enforce: 'post',
			apply: 'build',
			sharedDuringBuild: true,

			config(config) {
				return {
					...config,
					build: {
						...config.build,
						outDir: config.build?.outDir ?? 'server',
					},
					define: {
						'process.env.NODE_ENV': JSON.stringify('production'),
						...config.define,
					},
				};
			},

			configResolved(config) {
				adapterConfig = resolveAdapterConfig(config, options);
				router = config.plugins.find(
					(plugin) => plugin.name === 'vite-plugin-qwik-router',
				) as QwikRouterPlugin | undefined;
				if (!router) {
					throw new Error('Missing vite-plugin-qwik-router');
				}
			},

			resolveId(id) {
				if (id === QWIK_SSG_ENTRY_ID) {
					return QWIK_SSG_ENTRY_RESOLVED;
				}
				return null;
			},

			load(id) {
				if (id !== QWIK_SSG_ENTRY_RESOLVED || !adapterConfig || !router) {
					return null;
				}

				const basePathname = router.api.getBasePathname();
				const ssgOrigin = normalizeOrigin(ssg?.origin ?? options.origin);
				const ssgOptions: Record<string, unknown> = {
					...ssg,
					origin: ssgOrigin,
					outDir: adapterConfig.clientOutDir,
					basePathname,
					rootDir: adapterConfig.rootDir,
				};
				for (const key of Object.keys(ssgOptions)) {
					if (ssgOptions[key] === undefined) {
						delete ssgOptions[key];
					}
				}

				return [
					`import { isMainThread } from 'node:worker_threads';`,
					`import render from ${JSON.stringify(resolve(adapterConfig.rootDir, 'src/entry.ssr'))};`,
					`import qwikRouterConfig from '@qwik-router-config';`,
					`import manifest from ${JSON.stringify(join(adapterConfig.clientOutDir, 'q-manifest.json'))};`,
					`import { generate, startWorker } from '@qwik.dev/router/ssg';`,
					`globalThis.__QWIK_MANIFEST__ = manifest;`,
					`const baseSsgOpts = ${JSON.stringify(ssgOptions)};`,
					`const ssgRun = isMainThread ? generate({`,
					`  render,`,
					`  qwikRouterConfig,`,
					`  workerFilePath: new URL(import.meta.url).href,`,
					`  ...baseSsgOpts,`,
					`}).then((result) => {`,
					`  if (result.errors) {`,
					`    throw new Error('SSG completed with ' + result.errors + ' error(s)');`,
					`  }`,
					`}) : startWorker({ render, qwikRouterConfig });`,
					`ssgRun.then(() => {`,
					`  if (isMainThread) process.exit(0);`,
					`}).catch((error) => {`,
					`    console.error(error);`,
					`    process.exit(1);`,
					`});`,
				].join('\n');
			},

			buildStart() {
				if (isAdapterEnvironment(this, adapterConfig, 'serverEnvironment', 'server')) {
					outputEntries.length = 0;
				}
				if (
					!ssg ||
					!isAdapterEnvironment(this, adapterConfig, 'serverEnvironment', 'server')
				) {
					return;
				}
				this.emitFile({
					id: QWIK_SSG_ENTRY_ID,
					type: 'chunk',
					fileName: 'run-ssg.js',
				});
			},

			generateBundle(_, bundle) {
				if (!adapterConfig) {
					return;
				}
				if (!isAdapterEnvironment(this, adapterConfig, 'serverEnvironment', 'server')) {
					return;
				}
				outputEntries.length = 0;
				for (const [fileName, item] of Object.entries(bundle)) {
					if (item.type !== 'chunk') {
						continue;
					}
					if (item.isEntry) {
						outputEntries.push(fileName);
					}
				}
			},

			buildApp: {
				order: 'post',
				async handler(builder) {
					if (!adapterConfig || !router) {
						return;
					}

					await buildEnvironment(builder, adapterConfig.clientEnvironment);
					await buildEnvironment(builder, adapterConfig.serverEnvironment);

					if (ssg) {
						await runSsg(adapterConfig.serverOutDir);
					}

					const basePathname = router.api.getBasePathname();
					await options.generate?.({
						outputEntries,
						serverOutDir: adapterConfig.serverOutDir,
						clientOutDir: adapterConfig.clientOutDir,
						clientPublicOutDir: adapterConfig.clientOutDir,
						basePathname,
						routes: router.api.getRoutes(),
						assetsDir: adapterConfig.assetsDir,
						warn: (message) => this.warn(message),
						error: (message) => this.error(message),
					});

					this.warn(
						`\n==============================================` +
							`\nNote: Make sure that you are serving the built files with proper cache headers.` +
							`\nSee https://qwik.dev/docs/deployments/#cache-headers for more information.` +
							`\n==============================================`,
					);
				},
			},
		},
	];
}

export interface StaticAdapterOptions {
	origin?: string;
	ssg?: Record<string, unknown> | null;
	generate?: (options: StaticAdapterGenerateOptions) => Promise<void> | void;
	[key: string]: unknown;
}

export interface StaticAdapterGenerateOptions {
	outputEntries: string[];
	clientOutDir: string;
	clientPublicOutDir: string;
	serverOutDir: string;
	basePathname: string;
	routes: BuiltRouterRoute[];
	assetsDir?: string;
	warn: (message: string) => void;
	error: (message: string) => void;
}

type StaticAdapterConfig = ReturnType<typeof resolveAdapterConfig>;

function createSsgOptions(options: StaticAdapterOptions) {
	if (options.ssg === null) {
		return null;
	}
	const next: Record<string, unknown> = {
		include: ['/*'],
		...options,
		...(typeof options.ssg === 'object' && options.ssg ? options.ssg : {}),
	};
	for (const key of [
		'assetsDir',
		'clientEnvironment',
		'clientOutDir',
		'clientPublicOutDir',
		'generate',
		'serverEnvironment',
		'ssg',
	]) {
		delete next[key];
	}
	return next;
}

function resolveAdapterConfig(config: ResolvedConfig, options: StaticAdapterOptions) {
	const rootDir = resolve(config.root);
	const clientEnvironment = String(options.clientEnvironment ?? 'client');
	const serverEnvironment = String(options.serverEnvironment ?? 'ssr');
	const clientBuild = config.environments[clientEnvironment]?.build;
	const clientOutDir = resolve(rootDir, String(options.clientOutDir ?? 'dist'));

	return {
		assetsDir: String(options.assetsDir ?? clientBuild?.assetsDir ?? 'assets'),
		clientEnvironment,
		clientOutDir,
		rootDir,
		serverEnvironment,
		serverOutDir: resolve(rootDir, config.build.outDir),
	};
}

function normalizeOrigin(origin: unknown) {
	let value = typeof origin === 'string' && origin ? origin : 'https://yoursite.qwik.dev';
	if (value.length > 0 && !/:\/\//.test(value)) {
		value = `https://${value}`;
	}
	if (value.startsWith('//')) {
		value = `https:${value}`;
	}
	try {
		return new URL(value).origin;
	} catch {
		return 'https://yoursite.qwik.dev';
	}
}

async function runSsg(serverOutDir: string) {
	const { spawn } = await import('node:child_process');
	const exitCode = await new Promise<number | null>((resolveExit, reject) => {
		const child = spawn(process.execPath, [join(serverOutDir, 'run-ssg.js')], {
			stdio: ['ignore', 'inherit', 'inherit'],
		});
		child.on('close', resolveExit);
		child.on('error', reject);
	});

	if (exitCode !== 0) {
		const error = new Error(
			'Error while running SSG from "static-site-generation" adapter. At least one path failed to render.',
		);
		error.stack = undefined;
		throw error;
	}
}

async function buildEnvironment(builder: ViteBuilder, name: string) {
	const environment = builder.environments[name];
	if (environment && !environment.isBuilt) {
		await builder.build(environment);
	}
}

function isAdapterEnvironment(
	context: unknown,
	config: StaticAdapterConfig | undefined,
	name: 'clientEnvironment' | 'serverEnvironment',
	consumer: 'client' | 'server',
) {
	const environment = (
		context as {
			environment?: { config?: { consumer?: string }; name?: string };
		}
	).environment;
	return (
		!!config &&
		(environment?.name === config[name] || environment?.config?.consumer === consumer)
	);
}
