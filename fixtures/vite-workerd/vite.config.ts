import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import { qwik } from 'qwik-bundler/vite';

export default defineConfig({
	plugins: [cloudflare(), qwik()],
});
