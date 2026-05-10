import { describe, expect, test, vi } from 'vitest';
import { createViteHmr, QWIK_HMR_BRIDGE_ID } from '../src/vite/hmr';
import { qwik } from '../src/vite';
import {
	callConfigResolved,
	callConfigureServer,
	callHotUpdate,
	callLoad,
	callResolveId,
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
	test('injects only the Qwik bridge script through dev HTML middleware', () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');
		const middlewares = createMiddlewares();

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, { middlewares });

		const html = runHtmlMiddleware(middlewares, '<html><head></head><body></body></html>');
		expect(html).toContain('<script>globalThis.qInspector ??= true;</script>');
		expect(html).toContain(`<script type="module" src="/@id/${QWIK_HMR_BRIDGE_ID}"></script>`);
		expect(html).not.toContain('@vite/client');
	});

	test('prepends middleware and injects when the buffered response ends', () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');
		const middlewares = createMiddlewares();

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, { middlewares });

		expect(middlewares.stack[0]?.handle).toBeTypeOf('function');
		expect(runHtmlMiddleware(middlewares, '<html><head></head><body>')).toContain(
			QWIK_HMR_BRIDGE_ID,
		);
	});

	test('preserves response end callbacks without treating them as HTML chunks', () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');
		const middlewares = createMiddlewares();
		const callback = vi.fn();

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, { middlewares });

		expect(runMiddleware(middlewares, (res) => res.end(callback))).toBe('');
		expect(callback).toHaveBeenCalledTimes(1);
	});

	test('does not remove content-length after headers are sent', () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');
		const middlewares = createMiddlewares();
		const removeHeader = vi.fn(() => {
			throw new Error('headers already sent');
		});

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, { middlewares });

		const html = runMiddleware(middlewares, (res) => {
			res.headersSent = true;
			res.removeHeader = removeHeader;
			res.write('<html><head></head><body></body></html>');
			res.end();
		});

		expect(html).toContain(QWIK_HMR_BRIDGE_ID);
		expect(removeHeader).not.toHaveBeenCalled();
	});

	test('injects the Qwik bridge under the configured Vite base', () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');
		const middlewares = createMiddlewares();

		callConfigResolved(plugin, { base: '/docs/', command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, { middlewares });

		expect(runHtmlMiddleware(middlewares, '<html><head></head><body></body></html>')).toContain(
			`<script type="module" src="/docs/@id/${QWIK_HMR_BRIDGE_ID}"></script>`,
		);
	});

	test('does not inject the Qwik bridge when HMR is disabled', () => {
		const plugin = getPlugin(qwik({ hmr: false }), 'vite-plugin-qwik');
		const middlewares = createMiddlewares();

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, { middlewares });

		expect(middlewares.stack).toHaveLength(0);
	});

	test('does not duplicate bridge injection when HTML already includes it', () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');
		const middlewares = createMiddlewares();
		const html = `<html><head><script type="module" src="/@id/${QWIK_HMR_BRIDGE_ID}"></script></head></html>`;

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
		callConfigureServer(plugin, { middlewares });

		expect(runHtmlMiddleware(middlewares, html)).toBe(html);
	});

	test('GATE-04 does not expose an HTML transform hook during Vite build', () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');

		callConfigResolved(plugin, { command: 'build', root: '/workspace/app' });

		expect(plugin.transformIndexHtml).toBeUndefined();
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

function createMiddlewares() {
	const middlewares = {
		stack: [] as { route: string; handle: Function }[],
		use(handle: Function) {
			middlewares.stack.push({ route: '', handle });
		},
	};
	return middlewares;
}

function runHtmlMiddleware(middlewares: ReturnType<typeof createMiddlewares>, html: string) {
	return runMiddleware(middlewares, (res) => {
		res.write(html);
		res.end();
	});
}

function runMiddleware(
	middlewares: ReturnType<typeof createMiddlewares>,
	writeResponse: (res: ReturnType<typeof createResponse>) => void,
) {
	const handler = middlewares.stack[0]?.handle;
	if (typeof handler !== 'function') throw new Error('Expected dev HTML middleware');

	const res = createResponse();

	handler({ method: 'GET', headers: { accept: 'text/html' } }, res, () => writeResponse(res));
	return res.output;
}

function createResponse() {
	const headers = new Map<string, string>([['content-type', 'text/html;charset=utf-8']]);
	return {
		headersSent: false,
		output: '',
		write(chunk: unknown) {
			this.output += String(chunk);
			return true;
		},
		writeHead() {
			this.headersSent = true;
			return this;
		},
		flushHeaders() {
			this.headersSent = true;
		},
		end(chunk?: unknown, encoding?: unknown, callback?: () => void) {
			if (typeof chunk === 'function') {
				chunk();
				return this;
			}
			if (typeof encoding === 'function') {
				encoding();
			}
			callback?.();
			if (chunk !== undefined) this.output += String(chunk);
			return this;
		},
		getHeader(name: string) {
			return headers.get(name.toLowerCase());
		},
		hasHeader(name: string) {
			return headers.has(name.toLowerCase());
		},
		setHeader(name: string, value: string) {
			headers.set(name.toLowerCase(), value);
			return this;
		},
		removeHeader(name: string) {
			headers.delete(name.toLowerCase());
			return this;
		},
	};
}
