import { defineConfig } from 'rolldown';
import { qwik } from 'qwik-bundler/rolldown';

export default defineConfig([
	{
		input: 'src/client.tsx',
		output: {
			dir: 'dist/build',
			format: 'esm',
		},
		plugins: [qwik()],
	},
	{
		input: 'src/server.ts',
		output: {
			dir: 'server',
			format: 'esm',
		},
		platform: 'node',
		external: [/^node:/, 'h3'],
		plugins: [qwik({ environment: 'server' })],
	},
]);
