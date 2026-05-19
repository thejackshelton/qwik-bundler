import { isCSSRequest } from 'vite';
import { parsePath, withQuery } from 'ufo';
import type { DevEnvironment, EnvironmentModuleNode, HtmlTagDescriptor, ViteDevServer } from 'vite';
import type {
	ConnectNext,
	ConnectRequest,
	ConnectResponse,
	DevSsrEntry,
	DevSsrOptions,
	EnvironmentModuleGraphLike,
	FetchableServerEnvironment,
	RequestHandlerModule,
	RouterServerRequestEvent,
	RunnableServerEnvironment,
} from './types.ts';

export function createDevSsrMiddleware(server: ViteDevServer, options: DevSsrOptions) {
	return async (req: ConnectRequest, res: ConnectResponse, next: ConnectNext) => {
		if (isViteRequest(req.url)) {
			next();
			return;
		}
		try {
			const response = await getDevResponse(server, toFetchRequest(req), options);
			if (!response) {
				next();
				return;
			}
			await sendResponse(server, req, res, response);
		} catch (error) {
			if (error instanceof Error) {
				server.ssrFixStacktrace(error);
			}
			next(error);
		}
	};
}

export function getRouterIndexTags(server: ViteDevServer): HtmlTagDescriptor[] {
	return getDevStyleLinks(server).map(({ href, timestamp }) => ({
		tag: 'link',
		attrs: { rel: 'stylesheet', href: timestamp ? withQuery(href, { t: timestamp }) : href },
	}));
}

async function getDevResponse(server: ViteDevServer, request: Request, options: DevSsrOptions) {
	const environments = getServerEnvironments(server, options.serverEnvironment);
	for (const environment of environments) {
		if (environment?.config.consumer !== 'server') {
			continue;
		}
		const dispatchFetch = (environment as Partial<FetchableServerEnvironment>).dispatchFetch;
		if (dispatchFetch) {
			return dispatchFetch.call(environment, request);
		}
	}

	for (const environment of environments) {
		if (environment?.config.consumer !== 'server') {
			continue;
		}
		const runner = (environment as Partial<RunnableServerEnvironment>).runner;
		if (runner?.import) {
			return renderWithRunnableEnvironment(
				environment as RunnableServerEnvironment,
				request,
				options,
			);
		}
	}

	return null;
}

function getServerEnvironments(server: ViteDevServer, name: string | undefined) {
	if (name) {
		return [server.environments[name]];
	}
	const environments = Object.values(server.environments);
	const ssr = server.environments.ssr;
	if (!ssr) {
		return environments;
	}
	return [ssr, ...environments.filter((environment) => environment !== ssr)];
}

async function renderWithRunnableEnvironment(
	environment: RunnableServerEnvironment,
	request: Request,
	options: DevSsrOptions,
) {
	(globalThis as { __qwik?: unknown }).__qwik = undefined;
	const [entry, requestHandler] = await Promise.all([
		environment.runner.import<DevSsrEntry>('src/entry.ssr'),
		environment.runner.import<RequestHandlerModule>(
			'@qwik.dev/router/middleware/request-handler',
		),
	]);
	if (typeof entry.default !== 'function') {
		return null;
	}

	const handled = await requestHandler.requestHandler(
		createServerRequestEvent(request, requestHandler, options),
		{
			render: entry.default,
		},
	);
	if (!handled) {
		return null;
	}
	void handled.completion.then(logCompletionError, logCompletionError);
	const response = await handled.response;
	return response ?? null;
}

function logCompletionError(error: unknown) {
	if (error) {
		console.error(error);
	}
}

function createServerRequestEvent(
	request: Request,
	requestHandler: RequestHandlerModule,
	options: DevSsrOptions,
): RouterServerRequestEvent<Response> {
	const url = new URL(request.url);
	return {
		mode: 'server',
		locale: undefined,
		url,
		request,
		env: {
			get(key) {
				return getPlatformEnvValue(options.platform, key);
			},
		},
		getWritableStream: (status, headers, cookies, resolve) => {
			const { readable, writable } = new TransformStream<Uint8Array>();
			resolve(
				new Response(readable, {
					status,
					headers: requestHandler.mergeHeadersCookies(headers, cookies),
				}),
			);
			return writable;
		},
		getClientConn: () => ({}),
		platform: {
			ssr: true,
			request,
			...options.platform,
		},
	};
}

function getPlatformEnvValue(platform: Record<string, unknown> | undefined, key: string) {
	const env = platform?.env;
	if (env && typeof env === 'object' && 'get' in env && typeof env.get === 'function') {
		return env.get(key);
	}
	const value = platform?.[key];
	return typeof value === 'string' ? value : undefined;
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
	return Array.isArray(value) ? value[0] : value;
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

function getDevStyleLinks(server: ViteDevServer) {
	const styles = new Map<string, { href: string; timestamp: number }>();
	for (const environment of getStyleEnvironments(server)) {
		for (const mod of getStyleModulesInImportOrder(environment.moduleGraph)) {
			const href = getUrlPathname(mod.url);
			const existing = styles.get(href);
			const timestamp = Math.max(existing?.timestamp ?? 0, mod.lastHMRTimestamp || 0);
			if (!existing) {
				styles.set(href, { href, timestamp });
			} else {
				existing.timestamp = timestamp;
			}
		}
	}
	return [...styles.values()];
}

function getStyleEnvironments(server: ViteDevServer): DevEnvironment[] {
	const environments = Object.values(server.environments);
	const client = server.environments.client;
	return client
		? [client, ...environments.filter((environment) => environment !== client)]
		: environments;
}

function getStyleModulesInImportOrder(moduleGraph: EnvironmentModuleGraphLike) {
	const modules = [...moduleGraph.idToModuleMap.values()];
	const styles: EnvironmentModuleNode[] = [];
	const visited = new Set<EnvironmentModuleNode>();
	for (const root of modules) {
		if (!isJavaScriptEntryModule(root)) {
			continue;
		}
		addImportedStyles(root, visited, styles);
	}
	for (const mod of modules) {
		if (isCssModule(mod) && mod.importers.size === 0 && !visited.has(mod)) {
			visited.add(mod);
			styles.push(mod);
		}
	}
	return styles;
}

function addImportedStyles(
	mod: EnvironmentModuleNode,
	visited: Set<EnvironmentModuleNode>,
	styles: EnvironmentModuleNode[],
) {
	for (const imported of mod.importedModules) {
		if (visited.has(imported) || hasCssImporter(imported)) {
			continue;
		}
		visited.add(imported);
		if (isCssModule(imported)) {
			styles.push(imported);
			continue;
		}
		addImportedStyles(imported, visited, styles);
	}
}

function isJavaScriptEntryModule(mod: EnvironmentModuleNode) {
	return isJsSourceRequest(getUrlPathname(mod.url)) && mod.importers.size === 0;
}

function isCssModule(mod: EnvironmentModuleNode) {
	const href = getUrlPathname(mod.url);
	return href === mod.url && isCSSRequest(href);
}

function hasCssImporter(mod: EnvironmentModuleNode) {
	return [...mod.importers].some((importer) => isCSSRequest(getUrlPathname(importer.url)));
}

function getUrlPathname(url: string) {
	return parsePath(url).pathname;
}

function isJsSourceRequest(path: string) {
	return /\.[cm]?[jt]sx?$/.test(path);
}
