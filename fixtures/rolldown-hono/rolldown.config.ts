import { defineConfig } from 'rolldown';
import { qwik } from 'qwik-bundler/rolldown';

export default defineConfig([
	{
		input: 'src/client.tsx',
		output: {
			dir: 'dist',
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
		external: [/^node:/, '@hono/node-server', '@hono/node-server/serve-static', 'hono'],
		plugins: [qwik()],
	},
]);
