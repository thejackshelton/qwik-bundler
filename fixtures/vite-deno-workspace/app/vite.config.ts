import deno from '@deno/vite-plugin';
import { type Plugin, type ViteDevServer } from 'vite';
import { qwik } from '@qwik.dev/bundler/vite';

export default {
	plugins: [
		// Normal Deno + Qwik setup. Real apps usually add a meta-framework plugin
		// here too, such as Qwik Router, Nitro, Cloudflare, etc.
		deno(),
		qwik(),

		// Fixture-only: this app intentionally has no meta-framework, so this tiny
		// plugin provides the dev SSR request handler a meta-framework normally owns.
		denoSsrDev(),
	],
	build: {
		rolldownOptions: {
			input: 'src/root.tsx',
		},
	},
};

// Fixture-only dev SSR shim. In a real app, a meta-framework plugin owns this layer.

type SsrEntry = {
	render: (url?: string) => Promise<string>;
};

type DevRequest = {
	url?: string;
	method?: string;
	headers: Record<string, string | string[] | undefined>;
};

type DevResponse = {
	statusCode: number;
	statusMessage: string;
	setHeader(name: string, value: string): void;
	end(body?: Uint8Array): void;
};

function denoSsrDev(): Plugin {
	return {
		name: 'fixture:deno-ssr-dev',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use(async (request, response, next) => {
				const devRequest = request as DevRequest;
				if (!devRequest.url || devRequest.method !== 'GET' || !acceptsHtml(devRequest)) {
					next();
					return;
				}

				try {
					const rendered = await renderDevRequest(server, devRequest);
					sendResponse(response as DevResponse, rendered);
				} catch (error) {
					server.ssrFixStacktrace(error as Error);
					next(error);
				}
			});
		},
	};
}

async function renderDevRequest(server: ViteDevServer, request: DevRequest) {
	const url = new URL(request.url ?? '/', requestUrlOrigin(request));

	(globalThis as { __qwik?: string }).__qwik = undefined;
	const entry = (await server.ssrLoadModule('/src/entry.ssr.tsx')) as SsrEntry;
	const html = await entry.render(url.pathname);
	const transformed = await viteHtmlTransforms(server, url.pathname);
	return {
		html: injectHtmlTransforms(html, transformed),
		status: 200,
		statusText: 'OK',
		headers: { 'Content-Type': 'text/html;charset=utf-8' },
	};
}

function acceptsHtml(request: DevRequest) {
	const accept = request.headers.accept;
	return typeof accept === 'string' && accept.includes('text/html');
}

function requestUrlOrigin(request: DevRequest) {
	const host = typeof request.headers.host === 'string' ? request.headers.host : 'localhost';
	return `http://${host}`;
}

async function viteHtmlTransforms(server: ViteDevServer, url: string) {
	const html = await server.transformIndexHtml(url, '<html><head></head><body></body></html>');
	return {
		head: html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '',
		body: html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? '',
	};
}

function injectHtmlTransforms(html: string, transforms: { head: string; body: string }) {
	return html
		.replace('</head>', `${transforms.head}</head>`)
		.replace('</body>', `${transforms.body}</body>`);
}

function sendResponse(
	response: DevResponse,
	rendered: {
		html: string;
		status: number;
		statusText: string;
		headers: Record<string, string>;
	},
) {
	response.statusCode = rendered.status;
	response.statusMessage = rendered.statusText;
	for (const [name, value] of Object.entries(rendered.headers)) {
		response.setHeader(name, value);
	}
	response.end(new TextEncoder().encode(rendered.html));
}
