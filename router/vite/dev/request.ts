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
			await sendResponse(server, req, res, response);
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

async function sendResponse(
	server: ViteDevServer,
	req: ConnectRequest,
	res: ConnectResponse,
	response: Response,
) {
	res.statusCode = response.status;
	const isHtml = response.headers.get('content-type')?.includes('text/html') ?? false;
	const setCookies = getSetCookieHeaders(response.headers);
	response.headers.forEach((value, name) => {
		const lowerName = name.toLowerCase();
		if (
			(isHtml && lowerName === 'content-length') ||
			(setCookies.length > 0 && lowerName === 'set-cookie')
		) {
			return;
		}
		res.setHeader(name, value);
	});
	if (setCookies.length > 0) {
		res.setHeader('set-cookie', setCookies);
	}

	if (!isHtml) {
		res.end(new Uint8Array(await response.arrayBuffer()));
		return;
	}

	const html = await response.text();
	const transformed = await addDevHtmlTags(server, req.url ?? '/', html);
	res.removeHeader?.('content-length');
	res.end(transformed);
}

function getSetCookieHeaders(headers: Headers) {
	return (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
}

async function addDevHtmlTags(server: ViteDevServer, url: string, html: string) {
	const htmlWithDevTags = await server.transformIndexHtml(
		url,
		'<html><head></head><body></body></html>',
	);
	const devTags = getHeadHtml(htmlWithDevTags);
	if (!devTags.trim()) {
		return html;
	}
	return insertIntoHead(html, devTags);
}

function getHeadHtml(html: string) {
	const openTag = /<head[^>]*>/i.exec(html);
	const closeTag = /<\/head>/i.exec(html);
	if (!openTag || closeTag?.index === undefined) {
		return '';
	}
	const start = openTag.index + openTag[0].length;
	if (closeTag.index <= start) {
		return '';
	}
	return html.slice(start, closeTag.index);
}

function insertIntoHead(html: string, headHtml: string) {
	const closeTag = /<\/head>/i.exec(html);
	if (!closeTag) {
		return `${headHtml}${html}`;
	}
	return `${html.slice(0, closeTag.index)}${headHtml}${html.slice(closeTag.index)}`;
}
