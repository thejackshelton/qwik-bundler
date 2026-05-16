import type { CodeSplittingOptions, OutputOptions } from 'rolldown';
import type { QwikEnvironment } from '../types.ts';

export const QWIK_BUILD = '@qwik.dev/core/build';
export const Q_BUILD_DIR = 'build';
export const Q_BUILD_PREFIX = `${Q_BUILD_DIR}/`;
export const Q_BUNDLE_GRAPH = `${Q_BUILD_PREFIX}bundle-graph.json`;

const VITE_PRELOAD_HELPER = '\0vite/preload-helper.js';
const QWIK_CORE_OR_HANDLERS_MODULE =
	/[/\\](core|qwik)[/\\](handlers|dist[/\\]core(\.prod|\.min)?)\.mjs$/;
const QWIK_PRELOADER_MODULE = /[/\\](core|qwik)[/\\]dist[/\\]preloader\.mjs$/;
const QWIK_LOADER_SCRIPT = /[/\\](core|qwik)[/\\]dist[/\\]qwikloader\.js$/;
const QWIK_CODE_SPLITTING_GROUPS = [
	{
		name: 'qwik-core',
		test: QWIK_CORE_OR_HANDLERS_MODULE,
	},
	{
		name: 'qwik-loader',
		test: QWIK_LOADER_SCRIPT,
	},
	{
		name: 'qwik-preloader',
		test: (id: string) =>
			id.endsWith(QWIK_BUILD) || id === VITE_PRELOAD_HELPER || QWIK_PRELOADER_MODULE.test(id),
	},
] satisfies NonNullable<CodeSplittingOptions['groups']>;

export function outputDefaults(output: OutputOptions, environment: QwikEnvironment): OutputOptions {
	if (environment === 'lib') {
		return output;
	}

	const next: OutputOptions = { ...output, hoistTransitiveImports: false };
	if (environment === 'server') {
		next.chunkFileNames ??= 'q-[hash].js';
		next.codeSplitting = qwikCodeSplitting(next.codeSplitting, false);
		return next;
	}

	next.entryFileNames ??= `${Q_BUILD_PREFIX}q-[hash].js`;
	next.chunkFileNames ??= `${Q_BUILD_PREFIX}q-[hash].js`;
	next.minifyInternalExports = false;
	next.strictExecutionOrder = true;
	next.codeSplitting = qwikCodeSplitting(next.codeSplitting, true);
	return next;
}

function qwikCodeSplitting(
	codeSplitting: OutputOptions['codeSplitting'],
	separateRuntimeEntries: boolean,
) {
	if (typeof codeSplitting === 'boolean') {
		throw new Error(
			'Qwik requires output.codeSplitting to be an object so runtime chunks can be grouped.',
		);
	}

	const next = {
		...codeSplitting,
		groups: [...QWIK_CODE_SPLITTING_GROUPS, ...(codeSplitting?.groups ?? [])],
	} satisfies CodeSplittingOptions;
	if (separateRuntimeEntries) {
		next.includeDependenciesRecursively = false;
	}
	return next;
}
