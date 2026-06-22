// Minimal ambient declaration for the unpublished optional peer
// `qwik-optimizer-ts`, so `tsc` resolves the dynamic import in
// `src/optimizer.ts` without the package installed. The bundler casts the
// result to its own `QwikOptimizer` contract, so no surface beyond
// `createOptimizer` is needed here. Contributors working on the TS optimizer
// integration link the real package with `pnpm link ../TS-Optimizer`.
declare module 'qwik-optimizer-ts' {
	export function createOptimizer(options?: unknown): Promise<unknown>;
}
