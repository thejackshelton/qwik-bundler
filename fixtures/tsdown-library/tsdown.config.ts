import { defineConfig } from 'tsdown';
import { qwik } from 'qwik-bundler/rolldown';

export default defineConfig({
	entry: ['src/index.tsx'],
	format: ['esm'],
	dts: true,
	external: [/^@qwik\.dev\/core/],
	plugins: [qwik()],
});
