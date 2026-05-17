import { defineConfig } from 'vite-plus';

export default defineConfig({
	staged: {
		'*': 'vp check --fix',
	},
	pack: {
		entry: {
			rolldown: './src/rolldown.ts',
			'router/vite/index': './router/vite/index.ts',
			'vite/index': './src/vite/index.ts',
		},
		format: ['esm'],
		dts: true,
		clean: true,
		exports: {
			customExports: () => ({
				'./rolldown': './dist/rolldown.mjs',
				'./router/vite': './dist/router/vite/index.mjs',
				'./vite': './dist/vite/index.mjs',
				'./package.json': './package.json',
			}),
		},
	},
	test: {
		environment: 'node',
		include: ['test/**/*.test.ts'],
	},
	lint: {
		ignorePatterns: ['dist/**', 'node_modules/**'],
	},
	fmt: {
		useTabs: true,
		tabWidth: 4,
		printWidth: 100,
		endOfLine: 'lf',
		singleQuote: true,
		ignorePatterns: ['dist/**', 'node_modules/**'],
	},
});
