import type { OutputOptions, Plugin, RolldownOptions } from 'rolldown';
import type { EntryStrategy, TransformModule } from '@qwik.dev/optimizer';
import { anyOf, charIn, createRegExp, exactly, maybe } from 'magic-regexp';
import type { BuildEntry, BuildRequest, Bundler } from './types';

export interface RolldownPluginOptions {
	srcDir?: string;
	rootDir?: string;
	entryStrategy?: EntryStrategy;
	filter?: (id: string) => boolean;
}

export interface RolldownBundlerOptions {
	config?: Omit<RolldownOptions, 'input' | 'plugins'>;
	output?: OutputOptions;
	plugins?: Plugin[];
	plugin?: RolldownPluginOptions;
	rolldown?: RolldownApi;
}

export interface RolldownApi {
	rolldown: (options: RolldownOptions) => Promise<{
		write: (options?: OutputOptions) => Promise<unknown>;
	}>;
}

export function qwikRolldownPlugin(
	request: BuildRequest,
	options: RolldownPluginOptions = {},
): Plugin {
	const filter = options.filter ?? defaultFilter;

	return {
		name: 'qwik:optimizer',
		async transform(code, id) {
			if (!filter(id)) {
				return null;
			}

			const output = await request.transformModules({
				input: [{ code, path: id }],
				entryStrategy: options.entryStrategy ?? { type: 'smart' },
				minify: 'simplify',
				transpileTs: true,
				transpileJsx: true,
				explicitExtensions: true,
				preserveFilenames: true,
				srcDir: options.srcDir ?? '',
				rootDir: options.rootDir,
				mode: request.environment === 'lib' ? 'lib' : 'prod',
				isServer: request.environment === 'server',
			});

			const module = getPrimaryModule(output.modules);
			if (!module) {
				return null;
			}

			return {
				code: module.code,
				map: module.map,
			};
		},
	};
}

export function rolldown(options: RolldownBundlerOptions = {}): Bundler {
	return async (request) => {
		const rolldownApi = options.rolldown ?? (await import('rolldown'));
		const build = await rolldownApi.rolldown({
			...options.config,
			input: toRolldownInput(request),
			plugins: [qwikRolldownPlugin(request, options.plugin), ...(options.plugins ?? [])],
		});

		return build.write(options.output ?? toOutputOptions(options.config?.output));
	};
}

function toRolldownInput(request: BuildRequest): RolldownOptions['input'] {
	const input = request.entries.client ?? request.entries.server;
	if (isEntryArray(input)) {
		return [...input];
	}
	return input;
}

function isEntryArray(input: BuildEntry | undefined): input is readonly string[] {
	return Array.isArray(input);
}

function toOutputOptions(output: RolldownOptions['output']): OutputOptions | undefined {
	if (Array.isArray(output)) {
		return output[0];
	}
	return output;
}

function getPrimaryModule(modules: TransformModule[]): TransformModule | undefined {
	return modules.find((module) => !module.isEntry && !module.segment) ?? modules[0];
}

const defaultFilterPattern = createRegExp(
	anyOf(
		exactly('.', maybe(charIn('cm')), charIn('jt'), 's', maybe('x')),
		exactly('.qwik.', maybe(charIn('cm')), 'js'),
	).at.lineEnd(),
);

function defaultFilter(id: string) {
	return defaultFilterPattern.test(id);
}
