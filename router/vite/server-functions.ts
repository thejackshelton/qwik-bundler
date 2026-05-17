import type { PluginContext } from 'rolldown';
import type { Plugin } from 'vite';

export const QWIK_ROUTER_SERVER_FUNCTIONS_ID = 'virtual:qwik-router-server-fns';

export interface ServerFunctionModule {
	id: string;
	code: string | null;
	importedIds: string[];
	dynamicallyImportedIds: string[];
}

export type ServerFunctionPluginContext = Pick<PluginContext, 'load' | 'resolve'>;

export interface CollectServerFunctionModuleOptions {
	/** Initial modules that should be walked for server$ registrations. */
	entries: Iterable<string>;
	/** The resolved virtual module id, so self-imports do not recurse forever. */
	resolvedVirtualId?: string;
}

export interface ServerFunctionsPluginOptions {
	/** Initial modules that should be walked for server$ registrations. */
	entries?: () => Iterable<string> | Promise<Iterable<string>>;
	/** Static module globs to eager-import when entries are not provided. */
	moduleGlobs?: () => string[] | Promise<string[]>;
	/** Public virtual module id that SSR code can import for registration side effects. */
	virtualId?: string;
	/** Vite plugin name. */
	name?: string;
}

export async function collectServerFunctionModuleIds(
	options: CollectServerFunctionModuleOptions,
	context: ServerFunctionPluginContext,
) {
	const resolvedVirtualId = options.resolvedVirtualId;
	const serverFunctionModules = new Set<string>();
	const queuedModuleIds = new Set(options.entries);
	const seenModuleIds = new Set<string>();

	while (queuedModuleIds.size > 0) {
		const id = queuedModuleIds.values().next().value;
		if (!id) {
			break;
		}
		queuedModuleIds.delete(id);

		if (seenModuleIds.has(id) || id === resolvedVirtualId) {
			continue;
		}
		seenModuleIds.add(id);

		const resolved = await context.resolve(id, undefined, { skipSelf: true });
		if (!resolved || resolved.external) {
			continue;
		}

		const moduleInfo = (await context.load({
			id: resolved.id,
		})) as ServerFunctionModule | null;
		if (!moduleInfo?.code) {
			continue;
		}

		if (moduleInfo.code.includes('serverQrl(')) {
			serverFunctionModules.add(moduleInfo.id);
		}

		for (const importedId of [
			...moduleInfo.importedIds,
			...moduleInfo.dynamicallyImportedIds,
		]) {
			if (importedId && !seenModuleIds.has(importedId)) {
				queuedModuleIds.add(importedId);
			}
		}
	}

	return [...serverFunctionModules];
}

export function serverFunctionsPlugin(options: ServerFunctionsPluginOptions): Plugin {
	const virtualId = options.virtualId ?? QWIK_ROUTER_SERVER_FUNCTIONS_ID;
	const resolvedVirtualId = `\0${virtualId}`;
	const serverFunctionModules = new Set<string>();
	let serverFunctionsReady: Promise<void> | null = null;

	function reset() {
		serverFunctionModules.clear();
		serverFunctionsReady = null;
	}

	async function collect(this: PluginContext) {
		if (serverFunctionsReady) {
			await serverFunctionsReady;
			return;
		}

		serverFunctionsReady = (async () => {
			const entries = await options.entries?.();
			if (!entries) {
				return;
			}
			const modules = await collectServerFunctionModuleIds(
				{ entries, resolvedVirtualId },
				this,
			);
			for (const id of modules) {
				serverFunctionModules.add(id);
			}
		})();

		await serverFunctionsReady;
	}

	reset();

	return {
		name: options.name ?? 'vite-plugin-qwik-router-server-functions',

		buildStart() {
			reset();
		},

		resolveId(id) {
			if (id === virtualId) {
				return { id: resolvedVirtualId, moduleSideEffects: 'no-treeshake' };
			}
		},

		load: {
			order: 'pre',
			async handler(id) {
				const isServerBuild =
					this.environment.config.consumer === 'server' &&
					this.environment.mode === 'build';

				if (id !== resolvedVirtualId) {
					return null;
				}
				if (isServerBuild) {
					await collect.call(this);
				}
				if (!isServerBuild || serverFunctionModules.size === 0) {
					const moduleGlobs = await options.moduleGlobs?.();
					if (isServerBuild && moduleGlobs?.length) {
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
					}
					return '// No Qwik Router server functions';
				}

				return [...serverFunctionModules]
					.sort()
					.map((moduleId) => `import ${JSON.stringify(moduleId)};`)
					.join('\n');
			},
		},
	};
}
