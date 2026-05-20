import { isAbsolute } from 'pathe';
import type {
	ExternalOption,
	ExternalOptionFunction,
	InputOptions,
	PluginContext,
	ResolveIdResult,
} from 'rolldown';
import type { ConfigEnv, Environment, Plugin, UserConfig } from 'vite';
import type { QwikEnvironment } from './types.ts';
import { isServerViteEnvironment } from './vite/environment.ts';

const QWIK_RUNTIME_DEPS = ['@qwik.dev/core', '@builder.io/qwik'];
const QWIK_OPTIMIZE_DEPS_EXCLUDE = [
	'@qwik.dev/core',
	'@qwik.dev/core/internal',
	'@qwik.dev/core/server',
	'@qwik.dev/core/jsx-runtime',
	'@qwik.dev/core/jsx-dev-runtime',
	'@qwik.dev/core/build',
	'@qwik.dev/core/loader',
	'@qwik.dev/core/preloader',
	'@builder.io/qwik',
];

type ExternalContext = { environment?: unknown };
type ViteHookContext = { environment?: Pick<Environment, 'config' | 'name'> };
type NoExternal = string | RegExp | (string | RegExp)[] | true;

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
	return {
		config: {
			order: 'post',
			handler(config, env) {
				configDefaults(config, env);
				if (env.command === 'serve') {
					applyQwikOptimizeDeps(config);
				}
				return undefined;
			},
		},
		configEnvironment(name, config) {
			if (!isServerViteEnvironment({ name, config })) {
				return;
			}

			const noExternal = withQwikRuntimeDeps(config.resolve?.noExternal);
			return noExternal ? { resolve: { noExternal } } : undefined;
		},
		async resolveId(source, importer, options) {
			if (!isServerEnvironment(this) || !isBareId(source)) {
				return null;
			}

			const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
			if (!resolved || (!isQwikOutput(resolved.id) && !isQwikRuntimeImport(source))) {
				return null;
			}

			return { ...resolved, external: false };
		},
	} satisfies Pick<Plugin, 'config' | 'configEnvironment' | 'resolveId'>;
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

function isQwikRuntimeImport(source: string) {
	return QWIK_RUNTIME_DEPS.some((dep) => source === dep || source.startsWith(`${dep}/`));
}

function isServerEnvironment(context: unknown) {
	const environment = (context as ViteHookContext).environment;
	return isServerViteEnvironment(environment);
}

function withQwikRuntimeDeps(existing: NoExternal | undefined) {
	if (existing === true) {
		return;
	}

	const noExternal = new Set(noExternalEntries(existing));
	QWIK_RUNTIME_DEPS.forEach((dep) => noExternal.add(dep));
	return [...noExternal];
}

function noExternalEntries(value: NoExternal | undefined) {
	if (!value || value === true) {
		return [];
	}

	return Array.isArray(value) ? value : [value];
}

function applyQwikOptimizeDeps(config: UserConfig) {
	const optimizeDeps = (config.optimizeDeps ??= {});
	optimizeDeps.exclude = withQwikOptimizeDeps(optimizeDeps.exclude);
	const rolldownOptions = (optimizeDeps.rolldownOptions ??= {});
	const transform = (rolldownOptions.transform ??= {});
	if (transform.jsx === undefined) {
		transform.jsx = { runtime: 'automatic', importSource: '@qwik.dev/core' };
	} else if (typeof transform.jsx === 'object') {
		transform.jsx.runtime ??= 'automatic';
		transform.jsx.importSource ??= '@qwik.dev/core';
	}
}

function withQwikOptimizeDeps(existing: string[] | undefined) {
	const exclude = new Set(existing);
	QWIK_OPTIMIZE_DEPS_EXCLUDE.forEach((dep) => exclude.add(dep));
	return [...exclude];
}

function isBareId(id: string) {
	return !id.startsWith('.') && !isAbsolute(id) && id.charCodeAt(0) !== 0;
}
