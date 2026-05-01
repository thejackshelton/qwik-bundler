import { defineConfig } from 'rolldown';
import { qwikClient, qwikServer } from '../../src/rolldown';

export default defineConfig([
	{
		input: 'src/client.tsx',
		output: {
			dir: 'dist',
			format: 'esm',
		},
		plugins: [qwikClient()],
	},
	{
		input: 'src/server.ts',
		output: {
			dir: 'server',
			format: 'esm',
		},
		platform: 'node',
		resolve: {
			conditionNames: ['development', 'import', 'node', 'default'],
		},
		external: [/^node:/, /^h3(\/.*)?$/],
		plugins: [qwikServer()],
	},
]);
