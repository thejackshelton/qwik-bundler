type SsrEntry = {
	render: (url?: string, manifest?: unknown) => Promise<string>;
};

export {};

const root = new URL('./dist/', import.meta.url);
const manifest = JSON.parse(await Deno.readTextFile(new URL('./q-manifest.json', root)));
const entryPath = './dist/server/entry.ssr.js';
const entry = (await import(entryPath)) as SsrEntry;
const port = Number(Deno.env.get('PORT') ?? 4173);

Deno.serve({ hostname: '127.0.0.1', port }, async (request) => {
	const url = new URL(request.url);
	const asset = await serveAsset(url.pathname);
	if (asset) {
		return asset;
	}

	const html = await entry.render(url.pathname, manifest);
	return new Response(html, {
		headers: { 'Content-Type': 'text/html;charset=utf-8' },
	});
});

async function serveAsset(pathname: string) {
	if (pathname === '/' || pathname.includes('..')) {
		return null;
	}

	const file = new URL(`.${pathname}`, root);
	if (!file.href.startsWith(root.href)) {
		return null;
	}

	try {
		const body = await Deno.readFile(file);
		return new Response(body, {
			headers: { 'Content-Type': contentType(pathname) },
		});
	} catch {
		return null;
	}
}

function contentType(pathname: string) {
	if (pathname.endsWith('.html')) return 'text/html;charset=utf-8';
	if (pathname.endsWith('.js')) return 'text/javascript;charset=utf-8';
	if (pathname.endsWith('.json')) return 'application/json;charset=utf-8';
	if (pathname.endsWith('.css')) return 'text/css;charset=utf-8';
	return 'application/octet-stream';
}
