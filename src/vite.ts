import type { ConfigEnv, HotUpdateOptions, Plugin, UserConfig } from 'vite';
import { hmrBridgeCode } from './client/hmr-bridge';
import {
	createPlugin,
	type BuildEnvironment,
	type PluginOptions,
	withQwikOutputDefaults,
} from './plugin';

const HMR_BRIDGE_ID = '@qwik-hmr-bridge';
const RESOLVED_HMR_BRIDGE_ID = `\0${HMR_BRIDGE_ID}`;

export interface VitePluginOptions extends PluginOptions {}

export function qwik(options: VitePluginOptions = {}): Plugin[] {
	const plugin = createPlugin(options, getBuildEnvironment);
	const basePlugin = plugin.plugin;
	let isServe = false;

	const qwikPlugin = {
		...(basePlugin as unknown as Plugin),
		name: 'vite-plugin-qwik',
		api: {
			getManifest: () => null,
		},
		config(config, env) {
			setQwikConfigDefaults(config, env);
		},
		configResolved(resolvedConfig) {
			isServe = resolvedConfig.command === 'serve';
			plugin.setOptimizerRoot(resolvedConfig.root);
		},
	} satisfies Plugin & { api: { getManifest: () => null } };

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

type ViteHookContext = {
	environment: {
		config: {
			consumer: 'client' | 'server';
			build?: { lib?: unknown };
		};
	};
};

function getBuildEnvironment(context: unknown): BuildEnvironment | undefined {
	const pluginContext = context as ViteHookContext;
	if (pluginContext.environment.config.build?.lib) {
		return 'lib';
	}

	if (pluginContext.environment.config.consumer === 'server') {
		return 'server';
	}

	return 'client';
}

function hotUpdate(pluginContext: ViteHookContext, ctx: HotUpdateOptions) {
	if (pluginContext.environment.config.consumer !== 'server' || ctx.modules.length === 0) {
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
