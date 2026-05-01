import type { HotUpdateOptions, Plugin } from 'vite';
import { hmrBridgeCode } from './client/hmr-bridge';
import { createPlugin, TRANSFORM_ID_FILTER, type PluginOptions } from './plugin';

const HMR_BRIDGE_ID = '@qwik-hmr-bridge';
const RESOLVED_HMR_BRIDGE_ID = `\0${HMR_BRIDGE_ID}`;

export interface VitePluginOptions extends PluginOptions {}

export function qwik(options: VitePluginOptions = {}): Plugin {
	const plugin = createPlugin(options);
	let isServe = false;

	return {
		name: plugin.plugin.name,
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
		transform: {
			filter: {
				id: { include: TRANSFORM_ID_FILTER },
			},
			handler(code, id) {
				return plugin.transform(code, id, {
					environment:
						options.environment ??
						(this.environment.config.consumer === 'server' ? 'server' : undefined),
				});
			},
		},
		hotUpdate(ctx) {
			return hotUpdate(this, ctx);
		},
	};
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
