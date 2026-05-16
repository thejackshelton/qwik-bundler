import deno from '@deno/vite-plugin';
import {
	createFetchableDevEnvironment,
	type Plugin,
	type ResolvedConfig,
	type ViteDevServer,
} from 'vite';
import { qwik } from '@qwik.dev/bundler/vite';

let viteServer: ViteDevServer | undefined;

export default {
	appType: 'custom',
	plugins: [
		// Normal Deno + Qwik setup. Real apps usually add a meta-framework plugin
		// here too, such as Qwik Router, Nitro, Cloudflare, etc.
		deno(),
		...qwik(),

		// Fixture-only: this app intentionally has no meta-framework, so this tiny
		// plugin provides the dev SSR request handler a meta-framework normally owns.
		denoSsrDev(),
	],
	environments: {
		deno: {
			consumer: 'server',
			dev: {
				createEnvironment(name: string, config: ResolvedConfig) {
					return createFetchableDevEnvironment(name, config, {
						hot: false,
						handleRequest: renderRequest,
					});
				},
			},
		},
	},
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

type FetchableEnvironment = {
	dispatchFetch(request: Request): Response | Promise<Response>;
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

async function renderRequest(request: Request) {
	if (!viteServer) {
		return new Response('Vite server not ready', { status: 500 });
	}

	const url = new URL(request.url);
	const entry = (await viteServer.ssrLoadModule('/src/entry.ssr.tsx')) as SsrEntry;
	const html = await entry.render(url.pathname);
	return new Response(html, {
		headers: { 'Content-Type': 'text/html;charset=utf-8' },
	});
}

function denoSsrDev(): Plugin {
	return {
		name: 'fixture:deno-ssr-dev',
		apply: 'serve',
		configureServer(server) {
			viteServer = server;
			server.middlewares.use(async (request, response, next) => {
				const devRequest = request as DevRequest;
				if (!devRequest.url || devRequest.method !== 'GET' || !acceptsHtml(devRequest)) {
					next();
					return;
				}

				try {
					const deno = server.environments.deno as unknown as FetchableEnvironment;
					const rendered = await deno.dispatchFetch(toFetchRequest(devRequest));
					await sendResponse(response as DevResponse, rendered);
				} catch (error) {
					server.ssrFixStacktrace(error as Error);
					next(error);
				}
			});
		},
	};
}

function acceptsHtml(request: DevRequest) {
	const accept = request.headers.accept;
	return typeof accept === 'string' && accept.includes('text/html');
}

function toFetchRequest(request: DevRequest) {
	const host = typeof request.headers.host === 'string' ? request.headers.host : 'localhost';
	return new Request(new URL(request.url ?? '/', `http://${host}`), {
		headers: toFetchHeaders(request.headers),
		method: request.method,
	});
}

function toFetchHeaders(headers: DevRequest['headers']) {
	const next = new Headers();
	for (const [name, value] of Object.entries(headers)) {
		if (Array.isArray(value)) {
			for (const item of value) next.append(name, item);
		} else if (value !== undefined) {
			next.append(name, value);
		}
	}
	return next;
}

async function sendResponse(response: DevResponse, rendered: Response) {
	response.statusCode = rendered.status;
	response.statusMessage = rendered.statusText;
	rendered.headers.forEach((value, name) => response.setHeader(name, value));
	response.end(rendered.body ? new Uint8Array(await rendered.arrayBuffer()) : undefined);
}
