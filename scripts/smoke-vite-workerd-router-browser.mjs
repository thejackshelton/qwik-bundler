import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = resolve(repoRoot, 'fixtures/vite-workerd-router');
const configFile = resolve(fixtureRoot, 'vite.config.ts');
const waitTimeout = 20_000;

let browser;
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

	browser = await chromium.launch();
	const page = await browser.newPage();
	const errors = [];
	page.on('console', (message) => {
		if (message.type() === 'error') {
			errors.push(message.text());
		}
	});
	page.on('pageerror', (error) => {
		errors.push(error.message);
	});
	page.on('requestfailed', (request) => {
		errors.push(`${request.method()} ${request.url()} failed: ${request.failure()?.errorText}`);
	});
	await page.goto(url, { waitUntil: 'networkidle', timeout: waitTimeout });
	console.log('Router modules after initial load:');
	for (const [name, environment] of Object.entries(server.environments)) {
		for (const mod of environment.moduleGraph.idToModuleMap.values()) {
			const id = mod.id || '';
			const url = mod.url || '';
			if (
				id.includes('@qwik.dev/router') ||
				url.includes('@qwik.dev/router') ||
				id.includes('index.qwik.mjs')
			) {
				console.log(
					JSON.stringify({
						environment: name,
						id,
						url,
						type: mod.type,
					}),
				);
			}
		}
	}

	await page.waitForSelector('h1', { timeout: waitTimeout });
	const h1Color = await page.locator('h1').evaluate((node) => getComputedStyle(node).color);
	if (h1Color !== 'rgb(253, 186, 116)') {
		throw new Error(`Expected styled h1 color, got ${h1Color}`);
	}

	const counter = page.getByRole('button', { name: '0' });
	await counter.click();
	await page.getByRole('button', { name: '1' }).waitFor({ timeout: waitTimeout });
	if (errors.length > 0) {
		throw new Error(`Browser errors:\n${errors.join('\n')}`);
	}

	console.log('Router workerd browser smoke passed: CSS applied and Qwik click resumed.');
} finally {
	await browser?.close();
	await server?.close();
}
