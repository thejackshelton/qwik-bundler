import { renderToString } from '@qwik.dev/core/server';
import Root from './root';

interface Env {
	ASSETS?: { fetch: (request: Request) => Promise<Response> | Response };
}

export default {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);
		if (url.pathname.startsWith('/build/')) {
			return env.ASSETS?.fetch(request) ?? new Response('Not found', { status: 404 });
		}
		if (url.pathname !== '/') {
			const asset = await env.ASSETS?.fetch(request);
			if (asset?.ok) return asset;
		}

		const result = await renderToString(<Root url={url.pathname} />, {
			containerAttributes: { lang: 'en-us' },
		});

		return new Response(result.html, {
			headers: { 'Content-Type': 'text/html;charset=utf-8' },
		});
	},
};
