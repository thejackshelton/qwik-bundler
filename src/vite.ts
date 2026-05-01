import type { HotUpdateOptions, Plugin } from 'vite';
import { hmrBridgeCode } from './client/hmr-bridge';
import {
	createPlugin,
	TRANSFORM_ID_FILTER,
	type BuildEnvironment,
	type PluginOptions,
} from './plugin';

const HMR_BRIDGE_ID = '@qwik-hmr-bridge';
const RESOLVED_HMR_BRIDGE_ID = `\0${HMR_BRIDGE_ID}`;

export interface VitePluginOptions extends PluginOptions {}

export function qwik(options: VitePluginOptions = {}): Plugin {
	const plugin = createPlugin(options);
	let isServe = false;
	let isLibraryBuild = false;

	return {
		name: 'vite-plugin-qwik',
		api: {
			getManifest: () => null,
		},
		configResolved(resolvedConfig) {
			isServe = resolvedConfig.command === 'serve';
			isLibraryBuild = Boolean(resolvedConfig.build.lib);
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
				environment: getBuildEnvironment(this, options, isLibraryBuild),
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
					environment: getBuildEnvironment(this, options, isLibraryBuild),
				});
			},
		},
		hotUpdate(ctx) {
			return hotUpdate(this, ctx);
		},
	};
}

function getBuildEnvironment(
	pluginContext: { environment: { config: { consumer: 'client' | 'server' } } },
	options: VitePluginOptions,
	isLibraryBuild: boolean,
): BuildEnvironment | undefined {
	if (options.environment) {
		return options.environment;
	}

	if (isLibraryBuild) {
		return 'lib';
	}

	if (pluginContext.environment.config.consumer === 'server') {
		return 'server';
	}

	return undefined;
}

function hotUpdate(
	pluginContext: { environment: { config: { consumer: 'client' | 'server' } } },
	ctx: HotUpdateOptions,
) {
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
