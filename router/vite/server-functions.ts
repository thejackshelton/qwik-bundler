import type { Plugin } from 'vite';

export const QWIK_ROUTER_SERVER_FUNCTIONS_ID = 'virtual:qwik-router-server-fns';

export interface ServerFunctionsPluginOptions {
	/** Static module globs to eager-import in server builds. */
	moduleGlobs?: () => string[] | Promise<string[]>;
	/** Public virtual module id that SSR code can import for registration side effects. */
	virtualId?: string;
	/** Vite plugin name. */
	name?: string;
}

export function serverFunctionsPlugin(options: ServerFunctionsPluginOptions): Plugin {
	const virtualId = options.virtualId ?? QWIK_ROUTER_SERVER_FUNCTIONS_ID;
	const resolvedVirtualId = `\0${virtualId}`;

	return {
		name: options.name ?? 'vite-plugin-qwik-router-server-functions',

		resolveId(id) {
			if (id === virtualId) {
				return { id: resolvedVirtualId, moduleSideEffects: 'no-treeshake' };
			}
		},

		load: {
			order: 'pre',
			async handler(id) {
				if (id !== resolvedVirtualId) {
					return null;
				}

				const isServer = this.environment.config.consumer === 'server';
				if (!isServer) {
					return '// No Qwik Router server functions';
				}

				const moduleGlobs = await options.moduleGlobs?.();
				if (!moduleGlobs?.length) {
					return '// No Qwik Router server functions';
				}

				return moduleGlobs
					.map((glob, index) => {
						return `const modules${index} = import.meta.glob(${JSON.stringify(glob)}, { eager: true });`;
					})
					.concat(
						'export default Object.assign({}, ' +
							moduleGlobs.map((_, index) => `modules${index}`).join(', ') +
							');',
					)
					.join('\n');
			},
		},
	};
}
