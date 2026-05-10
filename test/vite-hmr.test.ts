import { describe, expect, test, vi } from 'vitest';
import { callConfigureServer, callHotUpdate, callTransformIndexHtml } from './helpers';

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
