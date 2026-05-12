import { isAbsolute } from 'pathe';
import type {
	ExternalOption,
	ExternalOptionFunction,
	InputOptions,
	PluginContext,
	ResolveIdResult,
} from 'rolldown';
import type { ConfigEnv, Plugin, UserConfig } from 'vite';
import type { QwikEnvironment } from './types';

const QWIK_CORE = '@qwik.dev/core';
const BUILDER_QWIK = '@builder.io/qwik';

type ExternalContext = { environment?: unknown };

interface QwikExternalResolver {
	external: ExternalOptionFunction;
	resolve: (
		context: Pick<PluginContext, 'resolve'>,
		source: string,
		importer: string | undefined,
	) => Promise<ResolveIdResult>;
}

export function qwikExternal() {
	const externals = new Map<unknown, QwikExternalResolver>();

	return {
		options(context: unknown, input: InputOptions, environment: QwikEnvironment) {
			const key = externalKey(context, environment);
			if (environment !== 'server' || !input.external) {
				externals.delete(key);
				return;
			}

			const currentExternal = externals.get(key);
			if (currentExternal?.external === input.external) {
				return;
			}

			const external = createQwikExternal(input.external);
			externals.set(key, external);
			input.external = external.external;
		},
		resolve(
			context: Pick<PluginContext, 'resolve'>,
			environment: QwikEnvironment,
			source: string,
			importer: string | undefined,
		) {
			return externals
				.get(externalKey(context, environment))
				?.resolve(context, source, importer);
		},
	};
}

export function qwikViteExternal(configDefaults: (config: UserConfig, env: ConfigEnv) => void) {
	let qwikDeps: string[] = [];

	return {
		config: {
			order: 'post',
			async handler(config, env) {
				configDefaults(config, env);
				const root = config.root ?? process.cwd();
				const { searchForWorkspaceRoot } = await import('vite');
				const { crawlFrameworkPkgs } = await import('vitefu');
				const result = await crawlFrameworkPkgs({
					root,
					workspaceRoot: searchForWorkspaceRoot(root),
					isBuild: env.command === 'build',
					viteUserConfig: config,
					isFrameworkPkgByJson: isQwikPackage,
				});
				qwikDeps = result.optimizeDeps.exclude;
				return { optimizeDeps: result.optimizeDeps };
			},
		},
		configEnvironment(_name, config) {
			const existing = config.resolve?.noExternal;
			if (qwikDeps.length === 0 || existing === true) {
				return;
			}

			const noExternal = Array.isArray(existing) ? [...existing] : [];
			if (existing && !Array.isArray(existing)) {
				noExternal.push(existing);
			}

			const size = noExternal.length;
			for (const dep of qwikDeps) {
				if (!noExternal.includes(dep)) {
					noExternal.push(dep);
				}
			}

			if (noExternal.length === size) {
				return;
			}

			return { resolve: { noExternal } };
		},
	} satisfies Pick<Plugin, 'config' | 'configEnvironment'>;
}

function isQwikPackage(pkg: Record<string, any>) {
	const deps = [pkg.dependencies, pkg.peerDependencies, pkg.devDependencies];
	return Boolean(pkg.qwik || deps.some((dep) => dep?.[QWIK_CORE] || dep?.[BUILDER_QWIK]));
}

function createQwikExternal(external: ExternalOption): QwikExternalResolver {
	return {
		external(id, parentId, isResolved) {
			if (isQwikOutput(id)) {
				return false;
			}

			const result = externalResult(external, id, parentId, isResolved);
			if (result !== true) {
				return result;
			}

			if (!isResolved && isBareId(id)) {
				return false;
			}

			return true;
		},
		async resolve(context, source, importer) {
			if (!isBareId(source)) {
				return null;
			}

			if (externalResult(external, source, importer, false) !== true) {
				return null;
			}

			const resolved = await context.resolve(source, importer, { skipSelf: true });
			if (resolved && isQwikOutput(resolved.id)) {
				return { ...resolved, external: false };
			}

			return { id: source, external: true };
		},
	};
}

function externalKey(context: unknown, environment: QwikEnvironment) {
	const externalContext = context as ExternalContext;
	return externalContext.environment ?? environment;
}

function externalResult(
	external: ExternalOption,
	id: string,
	parentId: string | undefined,
	isResolved: boolean,
) {
	if (typeof external === 'function') {
		return external(id, parentId, isResolved);
	}

	if (!Array.isArray(external)) {
		return externalValueMatches(external, id);
	}

	return external.some((value) => externalValueMatches(value, id));
}

function externalValueMatches(value: string | RegExp, id: string) {
	if (typeof value === 'string') {
		return value === id;
	}

	value.lastIndex = 0;
	const matches = value.test(id);
	value.lastIndex = 0;
	return matches;
}

function isQwikOutput(id: string) {
	return id.includes('.qwik.');
}

function isBareId(id: string) {
	return !id.startsWith('.') && !isAbsolute(id) && id.charCodeAt(0) !== 0;
}
