import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import { qwik } from 'qwik-bundler/vite';

export default defineConfig({
	environments: {
		client: {
			build: {
				rolldownOptions: {
					input: './src/root.tsx',
				},
			},
		},
	},
	plugins: [nitro(), qwik()],
});
