import { createOptimizer, type EntryStrategy, type OptimizerOptions } from '@qwik.dev/optimizer';
import type { TransformModule } from '@qwik.dev/optimizer';
import { anyOf, createRegExp, exactly } from 'magic-regexp';
import { dirname, resolve } from 'node:path';
import type {
	InputOptions,
	OutputOptions,
	Plugin as RolldownPlugin,
	ResolveIdResult,
} from 'rolldown';

export type BuildEnvironment = 'client' | 'server' | 'lib';

export const TRANSFORM_ID_FILTER = createRegExp(
	anyOf(
		exactly('.', anyOf(exactly('jsx'), exactly('tsx'), exactly('ts'))),
		exactly('.qwik.', anyOf(exactly('mjs'), exactly('js'))),
	).at.lineEnd(),
);

export interface PluginOptions {
	entryStrategy?: EntryStrategy;
	optimizerOptions?: OptimizerOptions;
}

const VIRTUAL_SEGMENT_PREFIX = '\0qwik:segment:';
const QWIK_SERVER_ID = '@qwik.dev/core/server';
const QWIK_CLIENT_CHUNK_FILE_NAME = 'build/q-[hash].js';
const QWIK_SERVER_CHUNK_FILE_NAME = 'q-[hash].js';

export function createPlugin(
	options: PluginOptions = {},
	getEnvironmentFromContext?: (context: unknown) => BuildEnvironment | undefined,
) {
	let rootDir: string | undefined;
	let bundlerEnvironment: BuildEnvironment | undefined;
	let optimizerPromise: ReturnType<typeof createOptimizer> | undefined;
	const segments = new Map<string, TransformModule>();

	const setOptimizerRoot = (value: string | undefined) => {
		rootDir = value;
	};

	const transform = async (code: string, id: string, environment = getEnvironment()) => {
		if (code.includes(QWIK_SERVER_ID)) {
			bundlerEnvironment = 'server';
		}
		const optimizer = await getOptimizer();
		const output = await optimizer.transformModules({
			input: [{ code, path: id }],
			entryStrategy: options.entryStrategy ?? { type: 'smart' },
			minify: 'simplify',
			transpileTs: true,
			transpileJsx: true,
			explicitExtensions: true,
			preserveFilenames: true,
			srcDir: rootDir ?? '',
			rootDir,
			mode: environment === 'lib' ? 'lib' : 'prod',
			isServer: environment === 'server',
		});

		const module = getPrimaryModule(output.modules);
		cacheSegments(output.modules, environment);
		if (!module) {
			return null;
		}

		return {
			code: module.code,
			map: module.map,
		};
	};

	const plugin: RolldownPlugin & { tsdownConfigResolved?: () => void } = {
		name: 'qwik:optimizer',
		options(inputOptions) {
			return withQwikDefines(inputOptions);
		},
		outputOptions(outputOptions) {
			return withQwikOutputObjectDefaults(outputOptions, getHookEnvironment(this));
		},
		tsdownConfigResolved() {
			bundlerEnvironment = 'lib';
		},
		buildStart(options) {
			setOptimizerRoot(options.cwd);
		},
		resolveId(source, importer) {
			if (source === QWIK_SERVER_ID) {
				bundlerEnvironment = 'server';
			}
			return resolveId(source, importer, getHookEnvironment(this), this.resolve.bind(this));
		},
		load(id) {
			return load(id);
		},
		transform: {
			filter: {
				id: { include: TRANSFORM_ID_FILTER },
			},
			handler(code, id) {
				return transform(code, id, getEnvironment(getHookEnvironment(this)));
			},
		},
	};

	return { plugin, setOptimizerRoot };

	function getOptimizer() {
		optimizerPromise ??= createOptimizer(options.optimizerOptions ?? {});
		return optimizerPromise;
	}

	function getEnvironment(environment?: BuildEnvironment) {
		return environment ?? bundlerEnvironment ?? 'client';
	}

	function getHookEnvironment(context: unknown) {
		return getEnvironmentFromContext?.(context) ?? bundlerEnvironment;
	}

	function cacheSegments(modules: TransformModule[], environment: BuildEnvironment) {
		for (const module of modules) {
			if (module.segment) {
				segments.set(encodeSegmentId(environment, module.path), module);
			}
		}
	}

	async function resolveId(
		source: string,
		importer?: string,
		environment = getEnvironment(),
		resolver?: (
			source: string,
			importer?: string,
			options?: { skipSelf?: boolean },
		) => Promise<ResolveIdResult> | ResolveIdResult,
	) {
		const decodedImporter = importer ? decodeSegmentId(importer) : null;
		environment = decodedImporter?.environment ?? getEnvironment(environment);
		const importerPath = decodedImporter?.path ?? importer;
		if (!importerPath || !source.startsWith('.')) {
			return null;
		}

		const module = segments.get(
			encodeSegmentId(environment, resolve(dirname(stripQuery(importerPath)), source)),
		);
		if (module) {
			return encodeSegmentId(environment, module.path);
		}

		if (decodedImporter && resolver) {
			const importerModule = segments.get(encodeSegmentId(environment, decodedImporter.path));
			return resolver(source, importerModule?.segment?.origin ?? decodedImporter.path, {
				skipSelf: true,
			});
		}

		return null;
	}

	function load(id: string) {
		if (!id.startsWith(VIRTUAL_SEGMENT_PREFIX)) {
			return null;
		}

		const module = segments.get(id);
		return module ? { code: module.code, map: module.map } : null;
	}
}

function withQwikDefines(inputOptions: InputOptions) {
	const transform = (inputOptions.transform ??= {});
	const define = (transform.define ??= {});
	define['globalThis.qDev'] ??= 'false';
	define['import.meta.env.BASE_URL'] ??= '"/"';
	define['import.meta.env.DEV'] ??= 'false';
	define['import.meta.env.TEST'] ??= 'false';
	return inputOptions;
}

export type QwikOutputOptions = OutputOptions | OutputOptions[] | undefined;

export function withQwikOutputDefaults(output: QwikOutputOptions, environment?: BuildEnvironment) {
	if (Array.isArray(output)) {
		return output.map((item) => withQwikOutputObjectDefaults(item, environment));
	}

	return withQwikOutputObjectDefaults(output ?? {}, environment);
}

function withQwikOutputObjectDefaults(output: OutputOptions, environment?: BuildEnvironment) {
	const outputEnvironment = getOutputEnvironment(output, environment);
	if (outputEnvironment === 'lib') {
		return output;
	}

	const nextOutput = { ...output };
	if (outputEnvironment === 'client') {
		nextOutput.entryFileNames ??= QWIK_CLIENT_CHUNK_FILE_NAME;
	}
	nextOutput.chunkFileNames ??=
		outputEnvironment === 'server' ? QWIK_SERVER_CHUNK_FILE_NAME : QWIK_CLIENT_CHUNK_FILE_NAME;
	nextOutput.hoistTransitiveImports = false;
	return nextOutput satisfies OutputOptions;
}

function getOutputEnvironment(
	output: OutputOptions,
	environment: BuildEnvironment | undefined,
): BuildEnvironment {
	if (environment) {
		return environment;
	}

	return isServerOutput(output.dir) ? 'server' : 'client';
}

function isServerOutput(dir: OutputOptions['dir']) {
	if (typeof dir !== 'string') {
		return false;
	}

	return dir.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) === 'server';
}

function getPrimaryModule(modules: TransformModule[]): TransformModule | undefined {
	return modules.find((module) => !module.isEntry && !module.segment) ?? modules[0];
}

function encodeSegmentId(environment: BuildEnvironment, path: string) {
	return `${VIRTUAL_SEGMENT_PREFIX}${environment}:${path}`;
}

function decodeSegmentId(id: string) {
	if (!id.startsWith(VIRTUAL_SEGMENT_PREFIX)) {
		return null;
	}

	const value = id.slice(VIRTUAL_SEGMENT_PREFIX.length);
	const separator = value.indexOf(':');
	if (separator === -1) {
		return null;
	}

	return {
		environment: value.slice(0, separator) as BuildEnvironment,
		path: value.slice(separator + 1),
	};
}

function stripQuery(id: string) {
	const queryStart = id.search(/[?#]/);
	return queryStart === -1 ? id : id.slice(0, queryStart);
}
