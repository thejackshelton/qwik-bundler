import type {
	BuildEnvironment,
	ConfigEnv,
	Environment,
	EnvironmentOptions,
	Plugin,
	UserConfig,
	ViteBuilder,
	ViteDevServer,
} from 'vite';
import type { OutputOptions } from 'rolldown';
import { outputDefaults } from '../build/chunking.ts';
import { plugin as qwikRolldown } from '../rolldown.ts';
import { qwikViteExternal } from '../qwik-external.ts';
import type {
	BundleGraphAdder,
	QwikEnvironment,
	QwikManifest,
	QwikRolldownOptions,
} from '../types.ts';
import { createViteHmr } from './hmr.ts';

export type {
	BundleGraphAdder,
	QwikEnvironment,
	QwikManifest,
	QwikRolldownOptions,
} from '../types.ts';

export interface VitePluginOptions extends QwikRolldownOptions {
	clientEnvironment?: string;
}

type QwikOutputOptions = OutputOptions | OutputOptions[] | undefined;
const QWIK_SKIP_DUPLICATE_CLIENT_BUILD = Symbol('qwik-skip-duplicate-client-build');

export function qwik(options: VitePluginOptions = {}): Plugin[] {
	let manifest: QwikManifest | null = null;
	const bundleGraphAdders = new Set<BundleGraphAdder>();
	const rolldownOptions = { ...options };
	rolldownOptions.bundleGraphAdders = bundleGraphAdders;
	rolldownOptions.onManifest = (nextManifest) => {
		manifest = nextManifest;
		options.onManifest?.(nextManifest);
	};
	const hmrOptions = {
		base: '/',
		enabled: false,
		invalidateDevSegments: (parent: string, environment?: QwikEnvironment) =>
			qwikPlugin.api.invalidateDevSegments(parent, environment),
	};

	// TODO: Remove this Qwik library noExternal workaround after https://github.com/QwikDev/qwik-evolution/discussions/318.
	const external = qwikViteExternal(configDefaults);
	const basePlugin = qwikRolldown(getBuildEnvironment, rolldownOptions) as Plugin;
	const hmr = createViteHmr(hmrOptions);

	const qwikPlugin = {
		...basePlugin,
		name: 'vite-plugin-qwik',
		enforce: 'post',
		api: {
			...(basePlugin.api as QwikPluginApi),
			getManifest: () => manifest,
			registerBundleGraphAdder: (adder: BundleGraphAdder) => bundleGraphAdders.add(adder),
		},
		...external,
		configResolved(resolvedConfig) {
			const serve = resolvedConfig.command === 'serve';
			hmrOptions.base = resolvedConfig.base;
			hmrOptions.enabled = serve && options.hmr !== false;
			rolldownOptions.dev = serve;
			rolldownOptions.rootDir = resolvedConfig.root;
		},
		configEnvironment(name, config) {
			const externalConfig = external.configEnvironment?.call(this, name, config) ?? {};
			if (name !== (options.clientEnvironment ?? 'client') || config.build?.lib) {
				return emptyConfig(externalConfig) ? undefined : externalConfig;
			}

			const build = config.build ?? {};
			const rolldownOptions = build.rolldownOptions ?? {};
			return {
				...externalConfig,
				build: {
					...build,
					rolldownOptions: {
						...rolldownOptions,
						output: withOutputDefaults(rolldownOptions.output, 'client'),
					},
				},
			};
		},
		buildApp: {
			order: 'pre',
			handler(builder) {
				return buildQwikClient(builder, options.clientEnvironment);
			},
		},
		configureServer(server: ViteDevServer) {
			rolldownOptions.devServer = server;
			hmr.configureServer(server);
		},
		transformIndexHtml() {
			return hmr.transformIndexHtml();
		},
		resolveId: {
			order: 'pre',
			async handler(source, importer, opts) {
				const hmrResolved = hmr.resolveId(source);
				if (hmrResolved) return hmrResolved;

				const ext = external.resolveId;
				const extResolved = await runHook(ext, this, source, importer, opts);
				if (extResolved) return extResolved;

				return runHook(basePlugin.resolveId, this, source, importer, opts);
			},
		},
		load(id, loadOptions) {
			return hmr.load(id) ?? runHook(basePlugin.load, this, id, loadOptions);
		},
		transform: {
			order: 'pre',
			handler(code, id, transformOptions) {
				return runHook(basePlugin.transform, this, code, id, transformOptions);
			},
		},
		hotUpdate(ctx) {
			return hmr.hotUpdate(this.environment, ctx);
		},
	} satisfies Plugin & { api: QwikPluginApi };

	return [qwikPlugin];
}

async function buildQwikClient(builder: ViteBuilder, clientEnvironment: string | undefined) {
	const name = clientEnvironment ?? 'client';
	const environment = builder.environments[name];
	if (environment && !environment.isBuilt) {
		skipDuplicateClientBuilds(builder, name);
		await builder.build(environment);
	}
}

function skipDuplicateClientBuilds(builder: ViteBuilder, name: string) {
	const guarded = builder as ViteBuilder & { [QWIK_SKIP_DUPLICATE_CLIENT_BUILD]?: true };
	if (guarded[QWIK_SKIP_DUPLICATE_CLIENT_BUILD]) {
		return;
	}

	guarded[QWIK_SKIP_DUPLICATE_CLIENT_BUILD] = true;
	const build = builder.build.bind(builder);
	builder.build = (environment: BuildEnvironment) => {
		if (environment.name === name && environment.isBuilt) {
			return Promise.resolve([]);
		}
		return build(environment);
	};
}

function configDefaults(config: UserConfig, env: ConfigEnv) {
	if (config.build?.lib || config.build?.ssr || env.mode === 'ssr') {
		return;
	}

	const build = (config.build ??= {});
	build.modulePreload ??= false;
}

function withOutputDefaults(
	output: QwikOutputOptions,
	environment: QwikEnvironment,
): OutputOptions | OutputOptions[] {
	if (Array.isArray(output)) {
		return output.map((item) => outputDefaults(item, environment));
	}

	if (!output) {
		return outputDefaults({}, environment);
	}

	return outputDefaults(output, environment);
}

function emptyConfig(config: EnvironmentOptions) {
	return Object.keys(config).length === 0;
}

function runHook(hook: unknown, context: unknown, ...args: unknown[]) {
	return typeof hook === 'function' ? hook.call(context, ...args) : null;
}

type QwikPluginApi = {
	invalidateDevSegments: (parent: string, environment?: QwikEnvironment) => string[];
	getManifest?: () => QwikManifest | null;
	registerBundleGraphAdder?: (adder: BundleGraphAdder) => void;
};

function getBuildEnvironment(context: unknown): QwikEnvironment {
	const pluginContext = context as { environment?: Environment };
	const environment = pluginContext.environment;
	const config = environment?.config;
	if (!config) {
		return 'client';
	}

	if (config.build?.lib) {
		return 'lib';
	}

	if (config.consumer === 'server') {
		return 'server';
	}
	if (environment?.name && environment.name !== 'client' && config.consumer !== 'client') {
		return 'server';
	}

	return 'client';
}
