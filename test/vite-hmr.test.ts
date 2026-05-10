import { describe, expect, test, vi } from 'vitest';
import { createViteHmr, QWIK_HMR_BRIDGE_ID } from '../src/vite/hmr';
import { qwik } from '../src/vite/index';
import {
	callConfigResolved,
	callConfigureServer,
	callHotUpdate,
	callLoad,
	callResolveId,
	callTransformIndexHtml,
	getPlugin,
} from './helpers';

describe('Vite HMR hook helpers', () => {
	test('invokes server and hot update hooks with caller-provided values', async () => {
		const configureServer = vi.fn();
		const hotUpdate = vi.fn().mockReturnValue([]);
		const plugin = { configureServer, hotUpdate };
		const server = { environments: {} };
		const environment = { name: 'client' };
		const ctx = { modules: [], timestamp: 1 };

		callConfigureServer(plugin, server);
		expect(await callHotUpdate(plugin, ctx, { environment })).toEqual([]);

		expect(configureServer).toHaveBeenCalledWith(server);
		expect(hotUpdate).toHaveBeenCalledWith(ctx);
		expect(hotUpdate.mock.instances[0]).toEqual({ environment });
	});
});

describe('Vite Qwik HMR bridge module', () => {
	test('resolves and loads the browser bridge runtime', async () => {
		const hmr = createViteHmr({ base: () => '/', enabled: () => true });
		const resolved = await callResolveId(hmr, QWIK_HMR_BRIDGE_ID);

		expect(resolved).toEqual({ id: `\0${QWIK_HMR_BRIDGE_ID}`, moduleSideEffects: true });

		const code = await callLoad(hmr, `\0${QWIK_HMR_BRIDGE_ID}`);
		expect(code).toContain("import.meta.hot.on('qwik:hmr'");
		expect(code).toContain("CustomEvent('qHmr'");
		expect(code).toContain('globalThis.qInspector ??= true');
		expect(code).toContain("document.querySelectorAll('[q-d\\\\:q-hmr]')");
		expect(code).toContain('data.t === document.__hmrT');
		expect(code).toContain('document.__hmrDone !== document.__hmrT');
		expect(code).toContain('location.reload()');
		expect(code).not.toContain('node:');
	});

	test('ignores unknown bridge ids', async () => {
		const hmr = createViteHmr({ base: () => '/', enabled: () => true });

		expect(await callResolveId(hmr, 'virtual:other')).toBeNull();
		expect(await callLoad(hmr, '\0virtual:other')).toBeNull();
	});
});

describe('Vite Qwik HMR bridge injection', () => {
	test('injects only the Qwik HMR bridge through Vite HTML transforms', async () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });

		const tags = await callTransformIndexHtml(plugin, '<html></html>');
		expect(tags).toEqual([
			{
				tag: 'script',
				children: 'globalThis.qInspector ??= true;',
				injectTo: 'head',
			},
			{
				tag: 'script',
				attrs: { type: 'module', src: `/@id/${QWIK_HMR_BRIDGE_ID}` },
				injectTo: 'head',
			},
		]);
		expect(JSON.stringify(tags)).not.toContain('@vite/client');
	});

	test('injects the Qwik HMR bridge under the configured Vite base', async () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');

		callConfigResolved(plugin, { base: '/docs/', command: 'serve', root: '/workspace/app' });

		expect(await callTransformIndexHtml(plugin, '<html></html>')).toContainEqual({
			tag: 'script',
			attrs: { type: 'module', src: `/docs/@id/${QWIK_HMR_BRIDGE_ID}` },
			injectTo: 'head',
		});
	});

	test('injects the Qwik HMR bridge into fetchable SSR HTML responses', async () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');
		const dispatchFetch = vi.fn().mockResolvedValue(
			new Response('<html><head></head><body></body></html>', {
				headers: { 'content-length': '39', 'content-type': 'text/html;charset=utf-8' },
			}),
		);
		const server = { environments: { ssr: { dispatchFetch } } };

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, server);

		const response = await server.environments.ssr.dispatchFetch(new Request('http://local/'));
		const html = await response.text();
		expect(html).toContain('<script>globalThis.qInspector ??= true;</script>');
		expect(html).toContain(`<script type="module" src="/@id/${QWIK_HMR_BRIDGE_ID}"></script>`);
		expect(response.headers.has('content-length')).toBe(false);
	});

	test('does not duplicate bridge injection in fetchable SSR HTML responses', async () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');
		const html = `<html><head><script type="module" src="/@id/${QWIK_HMR_BRIDGE_ID}"></script></head></html>`;
		const response = new Response(html, { headers: { 'content-type': 'text/html' } });
		const server = {
			environments: { ssr: { dispatchFetch: vi.fn().mockResolvedValue(response) } },
		};

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, server);

		expect(
			await (
				await server.environments.ssr.dispatchFetch(new Request('http://local/'))
			).text(),
		).toBe(html);
	});

	test('does not inject the Qwik HMR bridge when HMR is disabled', async () => {
		const plugin = getPlugin(qwik({ hmr: false }), 'vite-plugin-qwik');
		const dispatchFetch = vi.fn().mockResolvedValue(
			new Response('<html><head></head><body></body></html>', {
				headers: { 'content-type': 'text/html;charset=utf-8' },
			}),
		);
		const server = { environments: { ssr: { dispatchFetch } } };

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, server);

		const html = await (
			await server.environments.ssr.dispatchFetch(new Request('http://local/'))
		).text();
		expect(html).not.toContain(QWIK_HMR_BRIDGE_ID);
		expect(await callTransformIndexHtml(plugin, '<html></html>')).toBeUndefined();
	});

	test('GATE-04 does not inject the Qwik HMR bridge during Vite build', async () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');

		callConfigResolved(plugin, { command: 'build', root: '/workspace/app' });

		expect(await callTransformIndexHtml(plugin, '<html></html>')).toBeUndefined();
	});

	test('delegates bridge resolution and loading through the Vite plugin', async () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });

		const resolved = await callResolveId(plugin, QWIK_HMR_BRIDGE_ID);
		expect(resolved).toEqual({ id: `\0${QWIK_HMR_BRIDGE_ID}`, moduleSideEffects: true });
		expect(await callLoad(plugin, `\0${QWIK_HMR_BRIDGE_ID}`)).toContain(
			"import.meta.hot.on('qwik:hmr'",
		);
	});
});

describe('Vite Qwik HMR transport', () => {
	test('TEST-03 forwards SSR source hot updates through the client hot channel', async () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');
		const ssrModule = { id: '\0qwik:segment:server:/src/root.tsx_symbol.js' };
		const getModuleById = vi.fn().mockReturnValue(ssrModule);
		const invalidateModule = vi.fn();
		const ssrSend = vi.fn();
		const clientSend = vi.fn();
		const server = { environments: { client: { hot: { send: clientSend } } } };
		const environment = {
			name: 'ssr',
			moduleGraph: { getModuleById, invalidateModule },
			hot: { send: ssrSend },
		};
		const invalidateDevSegments = vi.fn().mockReturnValue([ssrModule.id]);

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, server);
		Object.assign(plugin, { api: { ...plugin.api, invalidateDevSegments } });

		expect(
			await callHotUpdate(
				plugin,
				{
					modules: [
						{ type: 'js', url: '/src/root.tsx?t=123#hash', importers: new Set() },
					],
					timestamp: 9012,
				},
				{ environment },
			),
		).toEqual([]);

		expect(invalidateDevSegments).toHaveBeenCalledWith('/src/root.tsx', 'server');
		expect(getModuleById).toHaveBeenCalledWith(ssrModule.id);
		expect(invalidateModule).toHaveBeenCalledWith(ssrModule, expect.any(Set), 9012, true);
		expect(clientSend).toHaveBeenCalledWith({
			type: 'custom',
			event: 'qwik:hmr',
			data: { files: ['/src/root.tsx'], t: 9012 },
		});
		expect(ssrSend).not.toHaveBeenCalled();
	});

	test('TEST-03 forwards only SSR source importers for non-source module updates', async () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');
		const invalidateDevSegments = vi.fn().mockReturnValue([]);
		const clientSend = vi.fn();
		const server = { environments: { client: { hot: { send: clientSend } } } };
		const environment = {
			name: 'ssr',
			moduleGraph: { getModuleById: vi.fn(), invalidateModule: vi.fn() },
			hot: { send: vi.fn() },
		};

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, server);
		Object.assign(plugin, { api: { ...plugin.api, invalidateDevSegments } });

		expect(
			await callHotUpdate(
				plugin,
				{
					modules: [
						{
							type: 'js',
							url: '/src/styles.css?inline',
							importers: new Set([
								{ type: 'js', url: '/src/entry.ssr.tsx?v=2', importers: new Set() },
								{ type: 'js', url: '/src/ignored.css?raw', importers: new Set() },
							]),
						},
					],
					timestamp: 3456,
				},
				{ environment },
			),
		).toEqual([]);

		expect(invalidateDevSegments).toHaveBeenCalledTimes(1);
		expect(invalidateDevSegments).toHaveBeenCalledWith('/src/entry.ssr.tsx', 'server');
		expect(clientSend).toHaveBeenCalledWith({
			type: 'custom',
			event: 'qwik:hmr',
			data: { files: ['/src/entry.ssr.tsx'], t: 3456 },
		});
		expect(JSON.stringify(clientSend.mock.calls)).not.toContain('styles.css');
		expect(JSON.stringify(clientSend.mock.calls)).not.toContain('ignored.css');
	});

	test('TEST-04 sends client full reload and no custom event when HMR is disabled', async () => {
		const plugin = getPlugin(qwik({ hmr: false }), 'vite-plugin-qwik');
		const send = vi.fn();
		const environment = {
			name: 'client',
			moduleGraph: { getModuleById: vi.fn(), invalidateModule: vi.fn() },
			hot: { send },
		};
		const invalidateDevSegments = vi.fn().mockReturnValue([]);

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		Object.assign(plugin, { api: { ...plugin.api, invalidateDevSegments } });

		expect(
			await callHotUpdate(
				plugin,
				{
					modules: [{ type: 'js', url: '/src/root.tsx?t=123', importers: new Set() }],
					timestamp: 1111,
				},
				{ environment },
			),
		).toEqual([]);

		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
		expect(JSON.stringify(send.mock.calls)).not.toContain('qwik:hmr');
	});

	test('TEST-04 sends full reload when HMR is disabled for non-source updates', async () => {
		const plugin = getPlugin(qwik({ hmr: false }), 'vite-plugin-qwik');
		const send = vi.fn();
		const environment = {
			name: 'client',
			moduleGraph: { getModuleById: vi.fn(), invalidateModule: vi.fn() },
			hot: { send },
		};
		const invalidateDevSegments = vi.fn().mockReturnValue([]);

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		Object.assign(plugin, { api: { ...plugin.api, invalidateDevSegments } });

		expect(
			await callHotUpdate(
				plugin,
				{
					modules: [{ type: 'css', url: '/src/global.css', importers: new Set() }],
					timestamp: 1112,
				},
				{ environment },
			),
		).toEqual([]);

		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
		expect(invalidateDevSegments).not.toHaveBeenCalled();
		expect(JSON.stringify(send.mock.calls)).not.toContain('qwik:hmr');
	});

	test('TEST-04 sends SSR full reload on the client channel when HMR is disabled', async () => {
		const plugin = getPlugin(qwik({ hmr: false }), 'vite-plugin-qwik');
		const ssrSend = vi.fn();
		const clientSend = vi.fn();
		const server = { environments: { client: { hot: { send: clientSend } } } };
		const environment = {
			name: 'ssr',
			moduleGraph: { getModuleById: vi.fn(), invalidateModule: vi.fn() },
			hot: { send: ssrSend },
		};
		const invalidateDevSegments = vi.fn().mockReturnValue([]);

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, server);
		Object.assign(plugin, { api: { ...plugin.api, invalidateDevSegments } });

		expect(
			await callHotUpdate(
				plugin,
				{
					modules: [{ type: 'js', url: '/src/root.tsx?t=123', importers: new Set() }],
					timestamp: 2222,
				},
				{ environment },
			),
		).toEqual([]);

		expect(clientSend).toHaveBeenCalledTimes(1);
		expect(clientSend).toHaveBeenCalledWith({ type: 'full-reload' });
		expect(ssrSend).not.toHaveBeenCalled();
		expect(JSON.stringify(clientSend.mock.calls)).not.toContain('qwik:hmr');
	});

	test('invalidates client dev segments and sends normalized source files', async () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');
		const segmentModule = { id: '\0qwik:segment:client:/src/root.tsx_symbol.js' };
		const getModuleById = vi.fn().mockReturnValue(segmentModule);
		const invalidateModule = vi.fn();
		const send = vi.fn();
		const environment = {
			name: 'client',
			moduleGraph: { getModuleById, invalidateModule },
			hot: { send },
		};
		const invalidateDevSegments = vi.fn().mockReturnValue([segmentModule.id]);

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		Object.assign(plugin, { api: { ...plugin.api, invalidateDevSegments } });

		expect(
			await callHotUpdate(
				plugin,
				{
					modules: [
						{
							type: 'js',
							url: '/src/root.tsx?t=123#hash',
							importers: new Set(),
						},
					],
					timestamp: 1234,
				},
				{ environment },
			),
		).toEqual([]);

		expect(invalidateDevSegments).toHaveBeenCalledWith('/src/root.tsx', 'client');
		expect(getModuleById).toHaveBeenCalledWith(segmentModule.id);
		expect(invalidateModule).toHaveBeenCalledWith(segmentModule, expect.any(Set), 1234, true);
		expect(send).toHaveBeenCalledWith({
			type: 'custom',
			event: 'qwik:hmr',
			data: { files: ['/src/root.tsx'], t: 1234 },
		});
	});

	test('falls back to Vite HMR when no hot channel is available', async () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');
		const invalidateDevSegments = vi.fn().mockReturnValue([]);
		const environment = {
			name: 'client',
			moduleGraph: { getModuleById: vi.fn(), invalidateModule: vi.fn() },
		};

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		Object.assign(plugin, { api: { ...plugin.api, invalidateDevSegments } });

		expect(
			await callHotUpdate(
				plugin,
				{
					modules: [{ type: 'js', url: '/src/root.tsx?t=123', importers: new Set() }],
					timestamp: 1235,
				},
				{ environment },
			),
		).toBeUndefined();
		expect(invalidateDevSegments).not.toHaveBeenCalled();
	});

	test('uses source importers as fallback for non-source module updates', async () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');
		const invalidateDevSegments = vi.fn().mockReturnValue([]);
		const send = vi.fn();
		const environment = {
			name: 'client',
			moduleGraph: { getModuleById: vi.fn(), invalidateModule: vi.fn() },
			hot: { send },
		};

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		Object.assign(plugin, { api: { ...plugin.api, invalidateDevSegments } });

		expect(
			await callHotUpdate(
				plugin,
				{
					modules: [
						{
							type: 'js',
							url: '/src/styles.css?inline',
							importers: new Set([
								{ type: 'js', url: '/src/entry.tsx?v=2', importers: new Set() },
								{ type: 'js', url: '/src/ignored.css?raw', importers: new Set() },
							]),
						},
						{
							type: 'css',
							url: '/src/global.css',
							importers: new Set(),
						},
						{
							type: 'js',
							url: '\0virtual:qwik-hmr-bridge',
							importers: new Set(),
						},
					],
					timestamp: 5678,
				},
				{ environment },
			),
		).toEqual([]);

		expect(invalidateDevSegments).toHaveBeenCalledTimes(1);
		expect(invalidateDevSegments).toHaveBeenCalledWith('/src/entry.tsx', 'client');
		expect(send).toHaveBeenCalledWith({
			type: 'custom',
			event: 'qwik:hmr',
			data: { files: ['/src/entry.tsx'], t: 5678 },
		});
		expect(JSON.stringify(send.mock.calls)).not.toContain('styles.css');
		expect(JSON.stringify(send.mock.calls)).not.toContain('ignored.css');
		expect(JSON.stringify(send.mock.calls)).not.toContain('virtual:qwik-hmr-bridge');
	});
});
