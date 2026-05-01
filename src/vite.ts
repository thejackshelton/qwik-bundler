import type { OutputOptions } from 'rolldown';
import type { ConfigEnv, HotUpdateOptions, Plugin, UserConfig } from 'vite';
import { hmrBridgeCode } from './client/hmr-bridge';
import {
	createPlugin,
	TRANSFORM_ID_FILTER,
	type BuildEnvironment,
	type PluginOptions,
	withQwikOutputDefaults,
} from './plugin';

const HMR_BRIDGE_ID = '@qwik-hmr-bridge';
const RESOLVED_HMR_BRIDGE_ID = `\0${HMR_BRIDGE_ID}`;

export interface VitePluginOptions extends PluginOptions {}

export function qwik(options: VitePluginOptions = {}): Plugin {
	const plugin = createPlugin(options);
	let isServe = false;

	return {
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
		resolveId(id, importer) {
			if (id === HMR_BRIDGE_ID) {
				return RESOLVED_HMR_BRIDGE_ID;
			}
			return plugin.resolveId(id, importer, {
				environment: getBuildEnvironment(this),
				resolve: this.resolve.bind(this),
			});
		},
		load(id) {
			if (id === RESOLVED_HMR_BRIDGE_ID) {
				return hmrBridgeCode;
			}
			return plugin.load(id);
		},
		transform: {
			filter: {
				id: { include: TRANSFORM_ID_FILTER },
			},
			handler(code, id) {
				return plugin.transform(code, id, {
					environment: getBuildEnvironment(this),
				});
			},
		},
		outputOptions(outputOptions) {
			return withQwikOutputDefaults(outputOptions, getBuildEnvironment(this));
		},
		hotUpdate(ctx) {
			return hotUpdate(this, ctx);
		},
	};
}

function setQwikConfigDefaults(config: UserConfig, env: ConfigEnv) {
	if (config.build?.lib || config.build?.ssr || env.mode === 'ssr') {
		return;
	}

	const build = (config.build ??= {});
	build.modulePreload ??= false;

	const rolldownOptions = (build.rolldownOptions ??= {});
	rolldownOptions.output = withQwikViteOutputDefaults(rolldownOptions.output);
}

function withQwikViteOutputDefaults(output: OutputOptions | OutputOptions[] | undefined) {
	if (Array.isArray(output)) {
		return output.map((item) => withQwikOutputDefaults(item, 'client'));
	}

	return withQwikOutputDefaults(output ?? {}, 'client');
}

type ViteHookContext = {
	environment: {
		config: {
			consumer: 'client' | 'server';
			build?: { lib?: unknown };
		};
	};
};

function getBuildEnvironment(pluginContext: ViteHookContext): BuildEnvironment {
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
