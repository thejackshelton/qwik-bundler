import type { OutputOptions } from 'rolldown';
import type { ConfigEnv, HotUpdateOptions, Plugin, UserConfig, ViteDevServer } from 'vite';
import { hmrBridgeCode } from './client/hmr-bridge';
import {
	outputDefaults,
	plugin as qwikRolldown,
	type QwikEnvironment,
	type QwikRolldownOptions,
} from './rolldown';
import type { QwikManifest } from './q-manifest';
import { qwikViteExternal } from './qwik-external';

const HMR_BRIDGE_ID = '@qwik-hmr-bridge';
const RESOLVED_HMR_BRIDGE_ID = `\0${HMR_BRIDGE_ID}`;

export interface VitePluginOptions extends QwikRolldownOptions {}

type QwikOutputOptions = OutputOptions | OutputOptions[] | undefined;

export function qwik(options: VitePluginOptions = {}): Plugin[] {
	const rolldownOptions = { ...options };
	// TODO: Remove this Qwik library noExternal workaround after https://github.com/QwikDev/qwik-evolution/discussions/318.
	const external = qwikViteExternal(setQwikConfigDefaults);
	let manifest: QwikManifest | null = null;
	rolldownOptions.onManifest = (nextManifest) => {
		manifest = nextManifest;
		options.onManifest?.(nextManifest);
	};
	const basePlugin = qwikRolldown(getBuildEnvironment, rolldownOptions) as Plugin;
	let isServe = false;

	const qwikPlugin = {
		...basePlugin,
		name: 'vite-plugin-qwik',
		enforce: 'pre',
		api: {
			getManifest: () => manifest,
		},
		...external,
		configResolved(resolvedConfig) {
			isServe = resolvedConfig.command === 'serve';
			rolldownOptions.dev = isServe;
			rolldownOptions.rootDir = resolvedConfig.root;
		},
		configureServer(server: ViteDevServer) {
			rolldownOptions.devServer = server;
		},
	} satisfies Plugin & { api: { getManifest: () => QwikManifest | null } };

	const hmrPlugin = {
		name: 'vite-plugin-qwik-hmr',
		transformIndexHtml() {
			if (!isServe) {
				return;
			}

			return [
				{
					tag: 'script',
					attrs: { type: 'module' },
					children: `import ${JSON.stringify(HMR_BRIDGE_ID)};`,
					injectTo: 'head',
				},
			];
		},
		resolveId(id) {
			if (id === HMR_BRIDGE_ID) {
				return RESOLVED_HMR_BRIDGE_ID;
			}
			return null;
		},
		load(id) {
			if (id === RESOLVED_HMR_BRIDGE_ID) {
				return hmrBridgeCode;
			}
			return null;
		},
		hotUpdate(ctx) {
			return hotUpdate(this, ctx);
		},
	} satisfies Plugin;

	return [qwikPlugin, hmrPlugin];
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

function hotUpdate(pluginContext: ViteHookContext, ctx: HotUpdateOptions) {
	if (pluginContext.environment?.config?.consumer !== 'server' || ctx.modules.length === 0) {
		return;
	}

	const files = new Set<string>();
	for (const module of ctx.modules) {
		const url = module.url?.split('?')[0];
		if (url) {
			files.add(url);
		}
	}

	if (files.size === 0) {
		return;
	}

	ctx.server.environments.client.hot.send({
		type: 'custom',
		event: 'qwik:hmr',
		data: { files: [...files], t: ctx.timestamp },
	});
}
