import { defineConfig } from 'rolldown';
import { qwik } from 'qwik-bundler/rolldown';

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
	plugins: [qwik()],
});
