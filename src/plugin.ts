import { createOptimizer, type EntryStrategy, type OptimizerOptions } from '@qwik.dev/optimizer';
import type { TransformModule } from '@qwik.dev/optimizer';
import { anyOf, createRegExp, exactly } from 'magic-regexp';
import type { Plugin as RolldownPlugin } from 'rolldown';

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
	transform: (
		code: string,
		id: string,
		options?: { environment?: BuildEnvironment },
	) => Promise<{ code: string; map: string | null } | null>;
}

export function createPlugin(options: PluginOptions = {}): Plugin {
	let rootDir: string | undefined;
	let optimizerPromise: ReturnType<typeof createOptimizer> | undefined;

	const setOptimizerRoot = (value: string | undefined) => {
		rootDir = value;
	};

	const transform = async (
		code: string,
		id: string,
		transformOptions: { environment?: BuildEnvironment } = {},
	) => {
		const environment = transformOptions.environment ?? options.environment ?? 'client';
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
		if (!module) {
			return null;
		}

		return {
			code: module.code,
			map: module.map,
		};
	};

	const plugin: RolldownPlugin = {
		name: 'qwik:optimizer',
		buildStart(options) {
			setOptimizerRoot(options.cwd);
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

	return { plugin, setOptimizerRoot, transform };

	function getOptimizer() {
		optimizerPromise ??= createOptimizer(options.optimizerOptions ?? {});
		return optimizerPromise;
	}
}

function getPrimaryModule(modules: TransformModule[]): TransformModule | undefined {
	return modules.find((module) => !module.isEntry && !module.segment) ?? modules[0];
}
