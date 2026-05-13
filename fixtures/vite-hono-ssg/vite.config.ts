import { defineConfig } from 'vite';
import { qwik } from 'qwik-bundler/vite';
import honoDevServer from '@hono/vite-dev-server';
import honoSiteGenerator from '@hono/vite-ssg';

export default defineConfig({
	publicDir: './public',
	plugins: [
		qwik(),
		honoDevServer({ entry: 'src/server.tsx' }),
		honoSiteGenerator({ entry: 'src/server.tsx' }),
	],
});
