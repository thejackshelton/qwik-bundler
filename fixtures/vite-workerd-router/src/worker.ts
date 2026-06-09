import { isDev } from '@qwik.dev/core/build';
import { setServerPlatform } from '@qwik.dev/core/server';
import type { ServerRenderOptions } from '@qwik.dev/router/middleware/request-handler';

interface WorkerEnv {
	ASSETS?: { fetch: (request: Request) => Promise<Response> | Response };
	[key: string]: unknown;
}

try {
	new globalThis.TextEncoderStream();
} catch {
	const { _TextEncoderStream_polyfill } =
		await import('@qwik.dev/router/middleware/request-handler');
	globalThis.TextEncoderStream = _TextEncoderStream_polyfill;
}

setServerPlatform(undefined);

export default {
	async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
		try {
			const requestHandlerModule =
				await import('@qwik.dev/router/middleware/request-handler');
			const url = new URL(request.url);
			if (requestHandlerModule.isStaticPath(request.method, url)) {
				return env.ASSETS?.fetch(request) ?? new Response('Not Found', { status: 404 });
			}
			resetQwikRuntime();
			const entry = await import('./entry.ssr');
			resetQwikRuntime();
			const opts: ServerRenderOptions = { render: entry.default };

			const handledResponse = await requestHandlerModule.requestHandler(
				{
					mode: 'server',
					locale: undefined,
					url,
					request,
					env: {
						get(key) {
							const value = env[key];
							return typeof value === 'string' ? value : undefined;
						},
					},
					getWritableStream: (status, headers, cookies, resolve) => {
						const { readable, writable } = new TransformStream<Uint8Array>();
						resolve(
							new Response(readable, {
								status,
								headers: requestHandlerModule.mergeHeadersCookies(headers, cookies),
							}),
						);
						return writable;
					},
					getClientConn: () => ({
						ip: request.headers.get('CF-connecting-ip') || '',
						country: request.headers.get('CF-IPCountry') || '',
					}),
					platform: {
						request,
						env,
						ctx,
					},
				},
				opts,
			);

			if (handledResponse) {
				void handledResponse.completion.then(logCompletionError, logCompletionError);
				const response = await handledResponse.response;
				if (response) {
					return response;
				}
			}

			const notFoundHtml = request.headers.get('accept')?.includes('text/html')
				? requestHandlerModule.getNotFound(url.pathname)
				: 'Not Found';
			return new Response(notFoundHtml, {
				status: 404,
				headers: { 'Content-Type': 'text/html; charset=utf-8' },
			});
		} catch (error) {
			console.error(error);
			return new Response(isDev ? String(error || 'Error') : 'Internal Server Error', {
				status: 500,
				headers: { 'Content-Type': 'text/plain; charset=utf-8' },
			});
		}
	},
};

function logCompletionError(error: unknown) {
	if (error) {
		console.error(error);
	}
}

function resetQwikRuntime() {
	(globalThis as { __qwik?: unknown }).__qwik = undefined;
}
