import { defineConfig } from 'vite';
import { qwikRouter } from 'qwik-bundler/router/vite';
import { qwik } from 'qwik-bundler/vite';

export default defineConfig({
	plugins: [qwikRouter(), qwik()],
});
