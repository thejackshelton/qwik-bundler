import type { OutputOptions } from 'rolldown';
import type { ConfigEnv, Plugin, UserConfig, ViteDevServer } from 'vite';
import { outputDefaults } from './build/chunking';
import type { QwikManifest } from './build/manifest';
import { plugin as qwikRolldown, type QwikEnvironment, type QwikRolldownOptions } from './rolldown';
import { qwikViteExternal } from './qwik-external';
import { createViteHmr } from './vite/hmr';

export interface VitePluginOptions extends QwikRolldownOptions {}

type QwikOutputOptions = OutputOptions | OutputOptions[] | undefined;

export function qwik(options: VitePluginOptions = {}): Plugin[] {
	const rolldownOptions = { ...options };
	// TODO: Remove this Qwik library noExternal workaround after https://github.com/QwikDev/qwik-evolution/discussions/318.
	const external = qwikViteExternal(setQwikConfigDefaults);
	let manifest: QwikManifest | null = null;
	let serve = false;
	let base = '/';
	rolldownOptions.onManifest = (nextManifest) => {
		manifest = nextManifest;
		options.onManifest?.(nextManifest);
	};
	const basePlugin = qwikRolldown(getBuildEnvironment, rolldownOptions) as Plugin;
	const hmr = createViteHmr({
		base: () => base,
		enabled: () => serve && options.hmr !== false,
		invalidateDevSegments: (parent, environment) =>
			qwikPlugin.api.invalidateDevSegments(parent, environment),
	});

	const qwikPlugin = {
		...basePlugin,
		name: 'vite-plugin-qwik',
		enforce: 'pre',
		api: {
			...(basePlugin.api as QwikPluginApi),
			getManifest: () => manifest,
		},
		...external,
		configResolved(resolvedConfig) {
			serve = resolvedConfig.command === 'serve';
			base = resolvedConfig.base;
			rolldownOptions.dev = serve;
			rolldownOptions.rootDir = resolvedConfig.root;
		},
		configureServer(server: ViteDevServer) {
			rolldownOptions.devServer = server;
			hmr.configureServer(server);
		},
		transformIndexHtml() {
			return hmr.transformIndexHtml();
		},
		resolveId(source, importer, resolveOptions) {
			const resolved = hmr.resolveId(source);
			if (resolved) {
				return resolved;
			}

			return typeof basePlugin.resolveId === 'function'
				? basePlugin.resolveId.call(this, source, importer, resolveOptions)
				: null;
		},
		load(id, loadOptions) {
			const code = hmr.load(id);
			if (code) {
				return code;
			}

			return typeof basePlugin.load === 'function'
				? basePlugin.load.call(this, id, loadOptions)
				: null;
		},
		hotUpdate(ctx) {
			return hmr.hotUpdate(this.environment, ctx);
		},
	} satisfies Plugin & { api: QwikPluginApi & { getManifest: () => QwikManifest | null } };

	return [qwikPlugin];
}

function setQwikConfigDefaults(config: UserConfig, env: ConfigEnv) {
	if (config.build?.lib || config.build?.ssr || env.mode === 'ssr') {
		return;
	}

	const build = (config.build ??= {});
	build.modulePreload ??= false;

	const rolldownOptions = (build.rolldownOptions ??= {});
	rolldownOptions.output = withQwikOutputDefaults(rolldownOptions.output, 'client');
}

function withQwikOutputDefaults(
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

type ViteHookContext = {
	environment?: {
		config?: {
			consumer?: 'client' | 'server';
			build?: { lib?: unknown };
		};
	};
};

type QwikPluginApi = {
	invalidateDevSegments: (parent: string, environment?: QwikEnvironment) => string[];
};

function getBuildEnvironment(context: unknown): QwikEnvironment {
	const pluginContext = context as ViteHookContext;
	const config = pluginContext.environment?.config;
	if (!config) {
		return 'client';
	}

	if (config.build?.lib) {
		return 'lib';
	}

	if (config.consumer === 'server') {
		return 'server';
	}

	return 'client';
}
