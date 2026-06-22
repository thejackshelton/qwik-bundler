import { defineConfig } from 'vite';
import { qwikRouter } from 'qwik-bundler/router/vite';
import { qwik } from 'qwik-bundler/vite';

// Opt into the experimental TypeScript optimizer (`qwik-ts-optimizer`) when
// QWIK_TS_OPTIMIZER is set — exercised by the interactive smoke test. Without
// it the fixture runs the default SWC optimizer.
export default defineConfig({
	plugins: [
		qwikRouter(),
		qwik(process.env.QWIK_TS_OPTIMIZER ? { experimental: ['tsOptimizer'] } : {}),
	],
});
