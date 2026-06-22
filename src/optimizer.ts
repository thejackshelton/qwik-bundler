import {
	createOptimizer as createSwcOptimizer,
	type TransformModuleInput,
	type TransformModulesOptions,
	type TransformOutput,
} from '@qwik.dev/optimizer';
import type { QwikRolldownOptions } from './types.ts';

export type QwikTransformInput = TransformModuleInput & {
	program?: unknown;
};

export interface QwikTransformOptions extends Omit<TransformModulesOptions, 'input'> {
	input: QwikTransformInput[];
}

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
	return import('qwik-ts-optimizer').then(
		(mod) => mod.createOptimizer(optimizerOptions) as Promise<QwikOptimizer>,
		(err) => {
			throw new Error(
				`qwik({ experimental: ['tsOptimizer'] }) failed to load \`qwik-ts-optimizer\`. ` +
					`See "TypeScript Optimizer (Experimental)" in qwik-bundler's README for setup.`,
				{ cause: err },
			);
		},
	);
}
