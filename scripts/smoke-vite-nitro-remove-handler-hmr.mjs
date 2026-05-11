import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { acquireLock } from './lib/lock.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = resolve(repoRoot, 'fixtures/vite-nitro-v3');
const configFile = resolve(fixtureRoot, 'vite.config.ts');
const homeFile = resolve(fixtureRoot, 'src/home.tsx');
const waitTimeout = 15_000;

let browser;
let releaseLock;
let server;
let originalHomeSource;

try {
	releaseLock = await acquireLock('fixture-vite-nitro-v3');
	originalHomeSource = await readFile(homeFile, 'utf8');
	const nextHomeSource = originalHomeSource.replace(
		/<button[\s\S]*?onClick\$=\{\(\) => count\.value\+\+\}[\s\S]*?>Count \{count\.value\}<\/button>/,
		'<button>Count {count.value}</button>',
	);
	if (nextHomeSource === originalHomeSource) {
		throw new Error(`Expected ${homeFile} to contain the count click handler button.`);
	}

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
	const failures = [];
	page.on('requestfailed', (request) => failures.push(request.url()));
	page.on('pageerror', (error) => failures.push(error.message));

	await page.goto(url, { waitUntil: 'networkidle', timeout: waitTimeout });
	await page.locator('button').first().waitFor({ state: 'visible', timeout: waitTimeout });

	await writeFile(homeFile, nextHomeSource);
	await page.waitForFunction(
		() => !document.querySelector('button')?.outerHTML.includes('q-e:click'),
		{ timeout: waitTimeout },
	);
	await page.locator('button').first().click();
	await page.waitForTimeout(250);

	if (failures.length) {
		throw new Error(`Unexpected failures after removed handler click: ${failures.join(' | ')}`);
	}

	console.log('Removed click handler without leaving stale QRL fetches.');
} finally {
	if (originalHomeSource !== undefined) await writeFile(homeFile, originalHomeSource);
	await browser?.close();
	await server?.close();
	await releaseLock?.();
}

process.exit(0);
