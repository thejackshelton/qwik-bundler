import type {
	OptimizerOptions,
	TransformModulesOptions,
	TransformOutput,
} from '@qwik.dev/optimizer';

export type BuildEnvironment = 'client' | 'server' | 'lib';

export type BuildEntry = string | readonly string[] | Record<string, string>;

export interface BuildEntries {
	client?: BuildEntry;
	server?: BuildEntry;
}

export interface BuildRequest {
	entries: BuildEntries;
	environment: BuildEnvironment;
	transformModules: (options: TransformModulesOptions) => Promise<TransformOutput>;
}

export type Bundler<TOutput = unknown> = (request: BuildRequest) => Promise<TOutput>;

export type BuildOptions<TOutput = unknown> = {
	/** Casual app API. Desugars to entries.client = entry. */
	entry?: string;
	/** Framework/integration API for hosts that already know the graph shape. */
	entries?: BuildEntries;
	environment?: BuildEnvironment;
	optimizerOptions?: OptimizerOptions;
	bundler: Bundler<TOutput>;
};

export interface BuildResult<TOutput = unknown> {
	entries: BuildEntries;
	environment: BuildEnvironment;
	output: TOutput;
}
