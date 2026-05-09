import { describe, expect, test } from 'vitest';
import { qwikClient } from '../src/rolldown';
import { callBuildStart, callGenerateBundle } from './helpers';

describe('static HTML output', () => {
	test('injects Qwik preloader bootstrap into generated HTML assets', async () => {
		const plugin = qwikClient();
		const bundle = staticHtmlBundle();

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callGenerateBundle(plugin, bundle);
		const html = bundle['index.html'].source;

		expect(html).toContain('rel="modulepreload"');
		expect(html).toContain('href="/build/q-preloader.js"');
		expect(html).toContain('bundle-graph.json');
		expect(html).toContain('then(({l})=>l(');
		expect(html).toContain('l("/build/",b)');
		expect(html).toContain('href="/build/q-core.js"');
		expect(html).toContain('href="/build/q-root.js"');
		expect(html).toContain('href="/build/q-home.js"');
		expect(html).toContain('href="/build/q-click.js"');
	});

	test('does not duplicate preloader markup already emitted by SSR or SSG', async () => {
		const plugin = qwikClient();
		const bundle = staticHtmlBundle();
		const source = bundle['index.html'].source.replace('<html>', '<html q:render="ssr">');
		bundle['index.html'].source = source;

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callGenerateBundle(plugin, bundle);

		expect(bundle['index.html'].source).toBe(source);
	});

	test('uses the generated HTML script base for injected URLs', async () => {
		const plugin = qwikClient();
		const bundle = staticHtmlBundle(
			'<html><head><script type="module" src="/app/build/q-entry.js"></script></head></html>',
		);

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callGenerateBundle(plugin, bundle);
		const html = bundle['index.html'].source;

		expect(html).toContain('href="/app/build/q-preloader.js"');
		expect(html).toContain('href="/app/build/bundle-graph.json"');
		expect(html).toContain('l("/app/build/",b)');
		expect(html).toContain('href="/app/build/q-click.js"');
	});

	test('finds module scripts when src appears before type', async () => {
		const plugin = qwikClient();
		const bundle = staticHtmlBundle(
			'<html><head><script src="/build/q-entry.js" crossorigin type="module"></script></head></html>',
		);

		callBuildStart(plugin, { cwd: '/workspace/app' });
		await callGenerateBundle(plugin, bundle);

		expect(bundle['index.html'].source).toContain('href="/build/q-click.js"');
	});
});

function staticHtmlBundle(
	source = '<html><head><title>App</title><script type="module" src="/build/q-entry.js"></script></head><body><div id="root"></div></body></html>',
) {
	return {
		'index.html': {
			type: 'asset',
			fileName: 'index.html',
			name: 'index.html',
			names: ['index.html'],
			source,
		},
		'build/q-entry.js': {
			type: 'chunk',
			fileName: 'build/q-entry.js',
			name: 'entry',
			code: 'export const entry = 1;',
			exports: ['entry'],
			imports: [],
			dynamicImports: ['build/q-root.js'],
			moduleIds: ['/workspace/app/src/main.tsx'],
			facadeModuleId: '/workspace/app/src/main.tsx',
		},
		'build/q-preloader.js': {
			type: 'chunk',
			fileName: 'build/q-preloader.js',
			name: 'preloader',
			code: 'export const l = () => {}; export const p = () => {};',
			exports: ['l', 'p'],
			imports: [],
			dynamicImports: [],
			moduleIds: ['/workspace/app/node_modules/@qwik.dev/core/dist/preloader.mjs'],
			facadeModuleId: '/workspace/app/node_modules/@qwik.dev/core/dist/preloader.mjs',
		},
		'build/q-root.js': {
			type: 'chunk',
			fileName: 'build/q-root.js',
			name: 'root',
			code: 'export const root = 1;',
			exports: ['root'],
			imports: [],
			dynamicImports: ['build/q-home.js'],
			moduleIds: ['/workspace/app/src/root.tsx_root_component_abc.js'],
			facadeModuleId: '/workspace/app/src/root.tsx_root_component_abc.js',
		},
		'build/q-home.js': {
			type: 'chunk',
			fileName: 'build/q-home.js',
			name: 'home',
			code: 'export const home = 1;',
			exports: ['home'],
			imports: [],
			dynamicImports: ['build/q-click.js'],
			moduleIds: ['/workspace/app/src/home.tsx_home_component_def.js'],
			facadeModuleId: '/workspace/app/src/home.tsx_home_component_def.js',
		},
		'build/q-click.js': {
			type: 'chunk',
			fileName: 'build/q-click.js',
			name: 'click',
			code: 'export const click = 1;',
			exports: ['click'],
			imports: [],
			dynamicImports: [],
			moduleIds: ['/workspace/app/src/home.tsx_click_component_ghi.js'],
			facadeModuleId: '/workspace/app/src/home.tsx_click_component_ghi.js',
		},
		'build/q-core.js': {
			type: 'chunk',
			fileName: 'build/q-core.js',
			name: 'core',
			code: 'export const _run = 1;',
			exports: ['_run'],
			imports: [],
			dynamicImports: [],
			moduleIds: ['/workspace/app/node_modules/@qwik.dev/core/dist/core.prod.mjs'],
			facadeModuleId: '/workspace/app/node_modules/@qwik.dev/core/dist/core.prod.mjs',
		},
	} as const;
}
