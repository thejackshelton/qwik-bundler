import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { qwikRouter } from 'qwik-bundler/router/vite';
import { qwik } from 'qwik-bundler/vite';

export default defineConfig({
	plugins: [
		cloudflare({
			viteEnvironment: { name: 'ssr' },
			inspectorPort: false,
			config: {
				name: 'vite-workerd-router-fixture',
				compatibility_date: '2024-09-19',
				main: './src/worker.ts',
				assets: {
					binding: 'ASSETS',
					directory: './dist',
				},
			},
		}),
		qwikRouter(),
		qwik(),
	],
});
