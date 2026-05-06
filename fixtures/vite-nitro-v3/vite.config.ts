import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import { qwik } from 'qwik-bundler/vite';

export default defineConfig({
	plugins: [nitro(), qwik()],
	environments: {
		client: {
			build: {
				rollupOptions: {
					input: './src/root.tsx',
				},
			},
		},
	},
});
