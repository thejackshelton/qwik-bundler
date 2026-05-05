import { defineConfig } from 'rolldown';
import { qwikServer } from '../../src/rolldown';

export default defineConfig({
	input: 'src/server.ts',
	output: {
		dir: 'server-noexternal',
		entryFileNames: 'server.js',
		format: 'esm',
	},
	platform: 'node',
	resolve: {
		conditionNames: ['development', 'import', 'node', 'default'],
	},
	external: [
		/^node:/,
		'@hono/node-server',
		'@hono/node-server/serve-static',
		'hono',
		'@fixtures/rolldown-library',
	],
	plugins: [qwikServer()],
});
