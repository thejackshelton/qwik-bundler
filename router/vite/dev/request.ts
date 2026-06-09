import { parsePath } from 'ufo';
import type { ViteDevServer } from 'vite';
import { fetchableDevEnvironment, viteEnvironmentName } from '../../../src/vite/environment.ts';
import type {
	ConnectNext,
	ConnectRequest,
	ConnectResponse,
	RouterDevRequestOptions,
} from '../types.ts';

export function createRouterDevRequestHandler(
	server: ViteDevServer,
	options: RouterDevRequestOptions,
) {
	return async (req: ConnectRequest, res: ConnectResponse, next: ConnectNext) => {
		if (isViteRequest(req.url)) {
			next();
			return;
		}

		const environment = fetchableDevEnvironment(
			server.environments[viteEnvironmentName('server', options)],
		);
		if (!environment) {
			next();
			return;
		}

		try {
			const response = await environment.dispatchFetch(toFetchRequest(req));
			await sendResponse(res, response);
		} catch (error) {
			if (error instanceof Error) {
				server.ssrFixStacktrace(error);
			}
			next(error);
		}
	};
}

function isViteRequest(url: string | undefined) {
	if (!url) {
		return true;
	}
	const pathname = parsePath(url).pathname;
	return (
		pathname.startsWith('/@vite/') ||
		pathname.startsWith('/@fs/') ||
		pathname.startsWith('/@id/') ||
		pathname.startsWith('/.vite/')
	);
}

function toFetchRequest(req: ConnectRequest) {
	const method = req.method ?? 'GET';
	const init: RequestInit & { duplex?: 'half' } = {
		headers: createFetchHeaders(req),
		method,
	};
	if (method !== 'GET' && method !== 'HEAD') {
		init.body = req as never;
		init.duplex = 'half';
	}
	return new Request(new URL(req.url ?? '/', requestOrigin(req)), init);
}

function requestOrigin(req: ConnectRequest) {
	const protocol = headerValue(req.headers['x-forwarded-proto']) ?? 'http';
	const host = headerValue(req.headers['x-forwarded-host']) ?? headerValue(req.headers.host);
	return `${protocol}://${host ?? 'localhost'}`;
}

function createFetchHeaders(req: ConnectRequest) {
	const headers = new Headers();
	for (const [name, value] of Object.entries(req.headers)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				headers.append(name, item);
			}
		} else if (value !== undefined) {
			headers.set(name, String(value));
		}
	}
	return headers;
}

function headerValue(value: string | string[] | undefined) {
	if (Array.isArray(value)) {
		return value[0];
	}
	return value;
}

async function sendResponse(res: ConnectResponse, response: Response) {
	res.statusCode = response.status;
	const setCookies = getSetCookieHeaders(response.headers);
	response.headers.forEach((value, name) => {
		if (setCookies.length > 0 && name.toLowerCase() === 'set-cookie') {
			return;
		}
		res.setHeader(name, value);
	});
	if (setCookies.length > 0) {
		res.setHeader('set-cookie', setCookies);
	}

	if (!response.body) {
		res.end();
		return;
	}
	for await (const chunk of response.body) {
		res.write(chunk);
	}
	res.end();
}

function getSetCookieHeaders(headers: Headers) {
	return (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
}
