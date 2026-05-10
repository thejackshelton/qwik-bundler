import { describe, expect, test, vi } from 'vitest';
import { createViteHmr, QWIK_HMR_BRIDGE_ID } from '../src/vite/hmr';
import { qwik } from '../src/vite';
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
	test('invokes HTML, server, and hot update hooks with caller-provided values', async () => {
		const transformIndexHtml = vi.fn().mockReturnValue([{ tag: 'script' }]);
		const configureServer = vi.fn();
		const hotUpdate = vi.fn().mockReturnValue([]);
		const plugin = { configureServer, hotUpdate, transformIndexHtml };
		const server = { environments: {} };
		const environment = { name: 'client' };
		const ctx = { modules: [], timestamp: 1 };

		expect(await callTransformIndexHtml(plugin, '<html></html>')).toEqual([{ tag: 'script' }]);
		callConfigureServer(plugin, server);
		expect(await callHotUpdate(plugin, ctx, { environment })).toEqual([]);

		expect(transformIndexHtml).toHaveBeenCalledWith('<html></html>', undefined);
		expect(configureServer).toHaveBeenCalledWith(server);
		expect(hotUpdate).toHaveBeenCalledWith(ctx);
		expect(hotUpdate.mock.instances[0]).toEqual({ environment });
	});
});

describe('Vite Qwik HMR bridge module', () => {
	test('resolves and loads the browser bridge runtime', async () => {
		const hmr = createViteHmr({ enabled: () => true });
		const resolved = await callResolveId(hmr, QWIK_HMR_BRIDGE_ID);

		expect(resolved).toEqual({ id: `\0${QWIK_HMR_BRIDGE_ID}`, moduleSideEffects: true });

		const code = await callLoad(hmr, `\0${QWIK_HMR_BRIDGE_ID}`);
		expect(code).toContain("import.meta.hot.on('qwik:hmr'");
		expect(code).toContain("CustomEvent('qHmr'");
		expect(code).toContain('data.t === document.__hmrT');
		expect(code).toContain('document.__hmrDone !== document.__hmrT');
		expect(code).toContain('location.reload()');
		expect(code).not.toContain('node:');
	});

	test('ignores unknown bridge ids', async () => {
		const hmr = createViteHmr({ enabled: () => true });

		expect(await callResolveId(hmr, 'virtual:other')).toBeNull();
		expect(await callLoad(hmr, '\0virtual:other')).toBeNull();
	});
});

describe('Vite Qwik HMR bridge injection', () => {
	test('injects only the Qwik bridge script in serve mode', async () => {
		const plugin = getPlugin(qwik(), 'vite-plugin-qwik');

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });

		const tags = await callTransformIndexHtml(plugin, '<html></html>');
		expect(tags).toEqual([
			{
				tag: 'script',
				attrs: { type: 'module', src: `/@id/${QWIK_HMR_BRIDGE_ID}` },
			},
		]);
		expect(JSON.stringify(tags)).not.toContain('@vite/client');
	});

	test('does not inject the Qwik bridge when HMR is disabled', async () => {
		const plugin = getPlugin(qwik({ hmr: false }), 'vite-plugin-qwik');

		callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });

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
