import { defineConfig } from 'vite';
import { qwik } from 'qwik-bundler/vite';

export default defineConfig({
	plugins: [qwik()],
	build: {
		lib: {
			entry: 'src/index.tsx',
			formats: ['es'],
		},
		rolldownOptions: {
			external: [/^@qwik\.dev\/core/],
		},
	},
});
