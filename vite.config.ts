import { defineConfig } from 'vite-plus';

export default defineConfig({
	staged: {
		'*': 'vp check --fix',
	},
	pack: {
		deps: {
			// `qwik-ts-optimizer` is opt-in via `experimental: ['tsOptimizer']`.
			// Mark it external so it stays as a runtime dynamic import that
			// consumers must install separately, rather than being inlined
			// into qwik-bundler's published bundle (which would also drag in
			// every transitive optimizer dep — oxc-walker, oxc-parser, etc.).
			neverBundle: ['satteri', 'qwik-ts-optimizer'],
		},
		entry: {
			rolldown: './src/rolldown.ts',
			'adapters/static/vite': './adapters/static/vite.ts',
			'router/vite/index': './router/vite/index.ts',
			'router/vite/runtime': './router/vite/runtime.ts',
			'vite/index': './src/vite/index.ts',
		},
		format: ['esm'],
		dts: true,
		clean: true,
		exports: {
			customExports: () => ({
				'./rolldown': './dist/rolldown.mjs',
				'./adapters/static/vite': './dist/adapters/static/vite.mjs',
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
