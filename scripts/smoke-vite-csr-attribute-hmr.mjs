import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { acquireLock } from './lib/lock.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = resolve(repoRoot, 'fixtures/vite-csr');
const configFile = resolve(fixtureRoot, 'vite.config.ts');
const homeFile = resolve(fixtureRoot, 'src/home.tsx');
const marker = `hmr-attr-${Date.now()}`;
const waitTimeout = 15_000;

let browser;
let releaseLock;
let server;
let originalHomeSource;

try {
	releaseLock = await acquireLock('fixture-vite-csr');
	originalHomeSource = await readFile(homeFile, 'utf8');
	const target = '<p>This app validates the Vite plugin directly.</p>';
	if (!originalHomeSource.includes(target)) {
		throw new Error(`Expected ${homeFile} to contain ${JSON.stringify(target)}.`);
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
	let navigationsAfterInitialLoad = 0;

	await page.goto(url, { waitUntil: 'networkidle', timeout: waitTimeout });
	await page.locator('p').waitFor({ state: 'visible', timeout: waitTimeout });
	page.on('framenavigated', (frame) => {
		if (frame === page.mainFrame()) navigationsAfterInitialLoad++;
	});

	await writeFile(
		homeFile,
		originalHomeSource.replace(
			target,
			`<p data-hmr="${marker}">This app validates the Vite plugin directly.</p>`,
		),
	);
	await page.waitForFunction(
		(expected) => document.querySelector('p')?.getAttribute('data-hmr') === expected,
		marker,
		{ timeout: waitTimeout },
	);

	if (navigationsAfterInitialLoad !== 0) {
		throw new Error(
			`Expected attribute HMR without reload, saw ${navigationsAfterInitialLoad}.`,
		);
	}

	console.log(`Applied attribute ${JSON.stringify(marker)} without reload.`);
} finally {
	if (originalHomeSource !== undefined) await writeFile(homeFile, originalHomeSource);
	await browser?.close();
	await server?.close();
	await releaseLock?.();
}
