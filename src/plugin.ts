import { createOptimizer, type EntryStrategy, type OptimizerOptions } from '@qwik.dev/optimizer';
import type { TransformModule } from '@qwik.dev/optimizer';
import { anyOf, createRegExp, exactly } from 'magic-regexp';
import { dirname, resolve } from 'node:path';
import type { Plugin as RolldownPlugin, ResolveIdResult } from 'rolldown';

export type BuildEnvironment = 'client' | 'server' | 'lib';

export const TRANSFORM_ID_FILTER = createRegExp(
	exactly(
		'.',
		anyOf(
			exactly('jsx'),
			exactly('tsx'),
			exactly('mjs'),
			exactly('mts'),
			exactly('js'),
			exactly('ts'),
		),
	).at.lineEnd(),
);

export interface PluginOptions {
	entryStrategy?: EntryStrategy;
	environment?: BuildEnvironment;
	optimizerOptions?: OptimizerOptions;
}

export interface Plugin {
	plugin: RolldownPlugin;
	setOptimizerRoot: (rootDir: string | undefined) => void;
	resolveId: (
		id: string,
		importer?: string,
		options?: ResolveOptions,
	) => Promise<ResolveIdResult> | ResolveIdResult;
	load: (id: string) => { code: string; map: string | null } | null;
	transform: (
		code: string,
		id: string,
		options?: { environment?: BuildEnvironment },
	) => Promise<{ code: string; map: string | null } | null>;
}

interface ResolveOptions {
	environment?: BuildEnvironment;
	resolve?: (
		source: string,
		importer?: string,
		options?: { skipSelf?: boolean },
	) => Promise<ResolveIdResult> | ResolveIdResult;
}

const VIRTUAL_SEGMENT_PREFIX = '\0qwik:segment:';

export function createPlugin(options: PluginOptions = {}): Plugin {
	let rootDir: string | undefined;
	let inferredEnvironment: BuildEnvironment | undefined;
	let optimizerPromise: ReturnType<typeof createOptimizer> | undefined;
	const segments = new Map<BuildEnvironment, Map<string, TransformModule>>();

	const setOptimizerRoot = (value: string | undefined) => {
		rootDir = value;
	};

	const transform = async (
		code: string,
		id: string,
		transformOptions: { environment?: BuildEnvironment } = {},
	) => {
		const environment =
			transformOptions.environment ?? options.environment ?? inferredEnvironment ?? 'client';
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
		tsdownConfigResolved() {
			inferredEnvironment = 'lib';
		},
		buildStart(options) {
			setOptimizerRoot(options.cwd);
		},
		resolveId(source, importer) {
			return resolveId(source, importer, { resolve: this.resolve.bind(this) });
		},
		load(id) {
			return load(id);
		},
		transform: {
			filter: {
				id: { include: TRANSFORM_ID_FILTER },
			},
			handler(code, id) {
				return transform(code, id);
			},
		},
	};

	return { plugin, setOptimizerRoot, resolveId, load, transform };

	function getOptimizer() {
		optimizerPromise ??= createOptimizer(options.optimizerOptions ?? {});
		return optimizerPromise;
	}

	function cacheSegments(modules: TransformModule[], environment: BuildEnvironment) {
		const environmentSegments = segments.get(environment) ?? new Map<string, TransformModule>();
		for (const module of modules) {
			if (module.segment) {
				environmentSegments.set(module.path, module);
			}
		}
		segments.set(environment, environmentSegments);
	}

	async function resolveId(
		source: string,
		importer?: string,
		resolveOptions: ResolveOptions = {},
	) {
		const decodedImporter = importer ? decodeSegmentId(importer) : null;
		const environment =
			resolveOptions.environment ??
			decodedImporter?.environment ??
			options.environment ??
			inferredEnvironment ??
			'client';
		const importerPath = decodedImporter?.path ?? importer;
		if (!importerPath || !source.startsWith('.')) {
			return null;
		}

		const module = segments
			.get(environment)
			?.get(resolve(dirname(stripQuery(importerPath)), source));
		if (module) {
			return encodeSegmentId(environment, module.path);
		}

		if (decodedImporter && resolveOptions.resolve) {
			const importerModule = segments.get(environment)?.get(decodedImporter.path);
			return resolveOptions.resolve(
				source,
				importerModule?.segment?.origin ?? decodedImporter.path,
				{
					skipSelf: true,
				},
			);
		}

		return null;
	}

	function load(id: string) {
		const segmentId = decodeSegmentId(id);
		if (!segmentId) {
			return null;
		}

		const module = segments.get(segmentId.environment)?.get(segmentId.path);
		return module ? { code: module.code, map: module.map } : null;
	}
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
