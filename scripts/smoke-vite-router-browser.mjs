import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = resolve(repoRoot, 'fixtures/vite-qwik-router');
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
	const consoleErrors = [];
	page.on('console', (message) => {
		if (message.type() === 'error') {
			consoleErrors.push(message.text());
		}
	});
	page.on('pageerror', (error) => {
		consoleErrors.push(error.message);
	});

	await page.goto(url, { waitUntil: 'networkidle', timeout: waitTimeout });
	await page.waitForSelector('h1', { timeout: waitTimeout });
	await page.getByRole('button', { name: '0' }).click();
	await page.getByRole('button', { name: '1' }).waitFor({ timeout: waitTimeout });

	console.log(JSON.stringify({ consoleErrors }, null, 2));
} finally {
	await browser?.close();
	await server?.close();
}
