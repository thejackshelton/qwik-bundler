import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = resolve(repoRoot, 'fixtures/vite-workerd-router');
const configFile = resolve(fixtureRoot, 'vite.config.ts');
const waitTimeout = 20_000;

let server;

try {
	server = await createServer({
		root: fixtureRoot,
		configFile,
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();

	const url = server.resolvedUrls?.local?.[0];
	if (!url) throw new Error('Vite dev server did not report a local URL.');

	const response = await fetchWithTimeout(url, waitTimeout);
	const html = await response.text();

	if (!response.ok) {
		throw new Error(`Expected HTTP 200, got ${response.status}: ${html.slice(0, 500)}`);
	}
	if (!html.includes('Hello from Qwik Router')) {
		throw new Error(`Expected router SSR content in HTML:\n${html.slice(0, 1000)}`);
	}
	if (!html.includes('/@vite/client')) {
		throw new Error(`Expected Vite client dev tag in HTML:\n${html.slice(0, 1000)}`);
	}
	if (!html.includes('/@id/virtual:qwik-router/dev-styles.css')) {
		throw new Error(`Expected dev stylesheet link in HTML:\n${html.slice(0, 1000)}`);
	}

	const stylesResponse = await fetchWithTimeout(
		new URL('/@id/virtual:qwik-router/dev-styles.css', url),
		waitTimeout,
		{ accept: 'text/css' },
	);
	const styles = await stylesResponse.text();
	if (!stylesResponse.ok) {
		throw new Error(`Expected HTTP 200 for dev styles, got ${stylesResponse.status}`);
	}
	if (!stylesResponse.headers.get('content-type')?.includes('text/css')) {
		throw new Error(
			`Expected text/css dev styles, got ${stylesResponse.headers.get('content-type')}`,
		);
	}
	// Vite inlines the @imports, so assert on compiled content from the fixture's global.css.
	if (!styles.includes('rgb(17, 24, 39)')) {
		console.log('Known CSS-like modules after request:');
		for (const [name, environment] of Object.entries(server.environments)) {
			for (const mod of environment.moduleGraph.idToModuleMap.values()) {
				const url = mod.url || '';
				const id = mod.id || '';
				if (url.includes('css') || id.includes('css')) {
					console.log(
						JSON.stringify({
							environment: name,
							id,
							url,
							type: mod.type,
							importers: [...mod.importers].map((item) => item.url || item.id),
						}),
					);
				}
			}
		}
		throw new Error(`Expected compiled dev CSS in dev styles:\n${styles.slice(0, 1000)}`);
	}

	console.log('Router workerd dev HTML includes router SSR, Vite client, and dev CSS.');
} finally {
	await server?.close();
}

async function fetchWithTimeout(url, timeout, headers) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);
	try {
		return await fetch(url, { signal: controller.signal, headers });
	} finally {
		clearTimeout(timer);
	}
}
