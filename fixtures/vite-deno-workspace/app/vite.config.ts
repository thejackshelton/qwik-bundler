import deno from '@deno/vite-plugin';
import {
	createRunnableDevEnvironment,
	type EnvironmentOptions,
	type Plugin,
	type RunnableDevEnvironment,
	type ViteDevServer,
} from 'vite';
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
// Keep it fetch-shaped so the fixture is not coupled to Vite's legacy Node SSR helpers.

type SsrEntry = {
	render: (url?: string) => Promise<string>;
};

type CreateEnvironment = NonNullable<NonNullable<EnvironmentOptions['dev']>['createEnvironment']>;

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

type DenoSsrEnvironment = RunnableDevEnvironment & {
	dispatchFetch(request: Request): Promise<Response>;
};

function denoSsrDev(): Plugin {
	let server: ViteDevServer | undefined;
	let ssrEnvironment: DenoSsrEnvironment | undefined;

	return {
		name: 'fixture:deno-ssr-dev',
		apply: 'serve',
		config() {
			return {
				environments: {
					ssr: {
						consumer: 'server',
						dev: {
							createEnvironment: ((name, config) => {
								const environment = createRunnableDevEnvironment(
									name,
									config,
								) as DenoSsrEnvironment;
								environment.dispatchFetch = (request) => {
									if (!server) {
										throw new Error('Vite dev server is not ready.');
									}
									return renderDevRequest(server, environment, request);
								};
								ssrEnvironment = environment;
								return environment;
							}) satisfies CreateEnvironment,
						},
					},
				},
			};
		},
		configureServer(devServer) {
			server = devServer;
			devServer.middlewares.use(async (nodeRequest, nodeResponse, next) => {
				const devRequest = nodeRequest as DevRequest;
				if (!devRequest.url || devRequest.method !== 'GET' || !acceptsHtml(devRequest)) {
					next();
					return;
				}

				try {
					const environment =
						ssrEnvironment ?? (devServer.environments.ssr as DenoSsrEnvironment);
					const request = toFetchRequest(devRequest);
					const response = await environment.dispatchFetch(request);
					await sendResponse(nodeResponse as DevResponse, response);
				} catch (error) {
					devServer.ssrFixStacktrace(error as Error);
					next(error);
				}
			});
		},
	};
}

async function renderDevRequest(
	_server: ViteDevServer,
	environment: DenoSsrEnvironment,
	request: Request,
) {
	const url = new URL(request.url);

	(globalThis as { __qwik?: string }).__qwik = undefined;
	const entry = (await environment.runner.import('/src/entry.ssr.tsx')) as SsrEntry;
	const html = await entry.render(url.pathname);
	return new Response(html, {
		headers: { 'Content-Type': 'text/html;charset=utf-8' },
	});
}

function acceptsHtml(request: DevRequest) {
	const accept = request.headers.accept;
	return typeof accept === 'string' && accept.includes('text/html');
}

function toFetchRequest(request: DevRequest) {
	return new Request(new URL(request.url ?? '/', requestUrlOrigin(request)), {
		headers: toFetchHeaders(request.headers),
		method: request.method,
	});
}

function toFetchHeaders(headers: DevRequest['headers']) {
	const next = new Headers();
	for (const [name, value] of Object.entries(headers)) {
		if (Array.isArray(value)) {
			for (const item of value) next.append(name, item);
		} else if (value) {
			next.set(name, value);
		}
	}
	return next;
}

function requestUrlOrigin(request: DevRequest) {
	const host = typeof request.headers.host === 'string' ? request.headers.host : 'localhost';
	return `http://${host}`;
}

async function sendResponse(response: DevResponse, rendered: Response) {
	response.statusCode = rendered.status;
	response.statusMessage = rendered.statusText;
	for (const [name, value] of rendered.headers) {
		response.setHeader(name, value);
	}
	response.end(new Uint8Array(await rendered.arrayBuffer()));
}
