import {
	createOptimizer as createSwcOptimizer,
	type TransformModuleInput,
	type TransformModulesOptions,
	type TransformOutput,
} from '@qwik.dev/optimizer';
import type { QwikRolldownOptions } from './types.ts';

export type QwikTransformInput = TransformModuleInput & {
	// Pre-parsed AST from the host bundler (Rolldown's `meta.ast`). The TS
	// optimizer uses it to skip its internal parse; SWC ignores it.
	program?: unknown;
};

export interface QwikTransformOptions extends Omit<TransformModulesOptions, 'input'> {
	input: QwikTransformInput[];
}

// Bundler-owned contract for an optimizer backend — the only optimizer
// surface the plugin consumes. Which backend satisfies it is decided here;
// the rest of the bundler never knows there is more than one.
export interface QwikOptimizer {
	transformModules(options: QwikTransformOptions): Promise<TransformOutput>;
}

export function createQwikOptimizer(options: QwikRolldownOptions): Promise<QwikOptimizer> {
	return options.experimental?.includes('tsOptimizer')
		? createTsOptimizer(options.optimizerOptions)
		: createSwcOptimizer(options.optimizerOptions);
}

function createTsOptimizer(
	optimizerOptions: QwikRolldownOptions['optimizerOptions'],
): Promise<QwikOptimizer> {
	return import('qwik-optimizer-ts').then(
		// The TS optimizer's NAPI-parity surface accepts raw-string options
		// (branding internally) and returns SWC-shaped output, so it meets
		// the contract directly. The single-step cast bridges one stale
		// declaration: SWC's published `SegmentAnalysis.ctxKind` omits
		// 'jSXProp' even though the Rust optimizer emits it at runtime; the
		// TS optimizer's parity type is honest and therefore wider.
		(mod) => mod.createOptimizer(optimizerOptions) as Promise<QwikOptimizer>,
		(err) => {
			throw new Error(
				`qwik({ experimental: ['tsOptimizer'] }) failed to load \`qwik-optimizer-ts\`. ` +
					`See "TypeScript Optimizer (Experimental)" in qwik-bundler's README for setup.`,
				{ cause: err },
			);
		},
	);
}
