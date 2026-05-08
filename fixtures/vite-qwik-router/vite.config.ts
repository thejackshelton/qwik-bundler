import { qwikRouter } from '@qwik.dev/router/vite';
import { defineConfig } from 'vite';
import { qwik } from 'qwik-bundler/vite';

export default defineConfig({
	plugins: [qwikRouter({ devSsrServer: true }), qwik()],
	build: {
		rolldownOptions: {
			input: './src/root.tsx',
		},
	},
});
