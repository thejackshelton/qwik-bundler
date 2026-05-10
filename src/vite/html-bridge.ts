import type { IncomingMessage, ServerResponse } from 'node:http';
import { joinURL } from 'ufo';

const QWIK_HMR_BRIDGE_ID = 'virtual:qwik-hmr-bridge';
const QWIK_HMR_BRIDGE_PATH = `/@id/${QWIK_HMR_BRIDGE_ID}`;
type Callback = (...args: unknown[]) => void;

type Middleware = (
	req: IncomingMessage,
	res: ServerResponse,
	next: (error?: unknown) => void,
) => void;

type Server = {
	middlewares?: {
		use: (handler: Middleware) => void;
		stack?: { route: string; handle: unknown }[];
	};
};

export function installHtmlBridge(server: Server, base: () => string) {
	const middlewares = server.middlewares;
	if (!middlewares) return;

	const handle = htmlBridge(base);
	if (Array.isArray(middlewares.stack)) {
		middlewares.stack.unshift({ route: '', handle });
		return;
	}
	middlewares.use(handle);
}

function htmlBridge(base: () => string): Middleware {
	return (req, res, next) => {
		if (req.method !== 'GET' || !req.headers.accept?.includes('text/html')) {
			next();
			return;
		}

		const write = res.write.bind(res);
		const end = res.end.bind(res);
		const writeHead = res.writeHead.bind(res);
		const flushHeaders = res.flushHeaders.bind(res);
		const chunks: unknown[] = [];
		let writeHeadArgs: unknown[] | undefined;

		res.writeHead = ((...args: unknown[]) => {
			writeHeadArgs = args;
			return res;
		}) as ServerResponse['writeHead'];
		res.flushHeaders = (() => undefined) as ServerResponse['flushHeaders'];
		res.write = ((
			chunk: unknown,
			encoding?: BufferEncoding | Callback,
			callback?: Callback,
		) => {
			chunks.push(chunk);
			(typeof encoding === 'function' ? encoding : callback)?.();
			return true;
		}) as ServerResponse['write'];
		res.end = ((
			chunk?: unknown | Callback,
			encoding?: BufferEncoding | Callback,
			callback?: Callback,
		) => {
			if (typeof chunk === 'function') {
				callback = chunk as Callback;
			} else if (chunk !== undefined) {
				chunks.push(chunk);
			}
			if (typeof encoding === 'function') callback = encoding as Callback;

			res.write = write;
			res.end = end;
			res.writeHead = writeHead;
			res.flushHeaders = flushHeaders;

			const html = chunks.map((item) => stringifyChunk(item)).join('');
			const nextHtml = injectBridge(html, base());
			if (nextHtml !== html && !res.headersSent) res.removeHeader?.('content-length');
			if (writeHeadArgs)
				(writeHead as (...args: unknown[]) => ServerResponse)(...writeHeadArgs);
			return callback ? end(nextHtml, callback as () => void) : end(nextHtml);
		}) as ServerResponse['end'];

		next();
	};
}

function stringifyChunk(chunk: unknown) {
	if (typeof chunk === 'string') return chunk;
	if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString('utf8');
	return '';
}

function injectBridge(html: string, base: string) {
	if (!html || html.includes(QWIK_HMR_BRIDGE_ID)) return html;
	const tags =
		'<script>globalThis.qInspector ??= true;</script>' +
		`<script type="module" src="${joinURL(base, QWIK_HMR_BRIDGE_PATH)}"></script>`;
	if (html.includes('</head>')) return html.replace('</head>', `${tags}</head>`);
	return html.includes('<head>') ? html.replace('<head>', `<head>${tags}`) : html;
}
