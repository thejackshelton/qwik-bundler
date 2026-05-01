import type { OptimizerOptions } from '@qwik.dev/optimizer';
import type { BuildEntries, BuildOptions, BuildResult } from './types';

const DEFAULT_ENVIRONMENT = 'client';

export async function buildQwik<TOutput = unknown>(
	options: BuildOptions<TOutput>,
): Promise<BuildResult<TOutput>> {
	const entries = getBuildEntries(options);
	const optimizerOptions = options.optimizerOptions ?? {};
	const optimizer = await loadOptimizer(optimizerOptions);
	const environment = options.environment ?? DEFAULT_ENVIRONMENT;

	const output = await options.bundler({
		entries,
		environment,
		transformModules: (transformOptions) => optimizer.transformModules(transformOptions),
	});

	return {
		entries,
		environment,
		output,
	};
}

function getBuildEntries(options: Pick<BuildOptions, 'entry' | 'entries'>): BuildEntries {
	if (options.entry !== undefined && options.entries !== undefined) {
		throw new Error('Qwik build accepts either "entry" or "entries", not both.');
	}

	if (options.entry !== undefined) {
		return { client: options.entry };
	}

	if (options.entries !== undefined) {
		return options.entries;
	}

	throw new Error('Qwik build requires "entry" or "entries".');
}

async function loadOptimizer(optimizerOptions?: OptimizerOptions) {
	const { createOptimizer } = await import('@qwik.dev/optimizer');
	return createOptimizer(optimizerOptions);
}
