import { defineConfig } from 'rolldown';
import { qwikLib } from '../../src/rolldown';

export default defineConfig({
	input: 'src/index.tsx',
	output: {
		dir: 'lib',
		format: 'esm',
		preserveModules: true,
		preserveModulesRoot: 'src',
		entryFileNames: '[name].qwik.mjs',
		chunkFileNames: '[name]-[hash].qwik.mjs',
	},
	platform: 'neutral',
	external: [/^@qwik\.dev\/core/],
	plugins: [qwikLib()],
});
