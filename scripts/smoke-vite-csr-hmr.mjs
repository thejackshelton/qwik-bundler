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
const initialText = 'Vite Direct Fixture';
const marker = `Vite CSR HMR Smoke ${Date.now()}`;
const waitTimeout = 15_000;

let browser;
let releaseLock;
let server;
let originalHomeSource;

try {
	releaseLock = await acquireLock('fixture-vite-csr');
	originalHomeSource = await readFile(homeFile, 'utf8');
	if (!originalHomeSource.includes(initialText)) {
		throw new Error(`Expected ${homeFile} to contain ${JSON.stringify(initialText)}.`);
	}

	server = await createServer({
		root: fixtureRoot,
		configFile,
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();

	const url = server.resolvedUrls?.local?.[0];
	if (!url) {
		throw new Error('Vite dev server did not report a local URL.');
	}

	browser = await chromium.launch();
	const page = await browser.newPage();
	let navigationsAfterInitialLoad = 0;

	await page.goto(url, { waitUntil: 'networkidle', timeout: waitTimeout });
	await page.locator('h1').waitFor({ state: 'visible', timeout: waitTimeout });
	await expectH1Text(page, initialText);

	page.on('framenavigated', (frame) => {
		if (frame === page.mainFrame()) {
			navigationsAfterInitialLoad++;
		}
	});

	await page.evaluate(() => {
		document.__qwikSmokeHmrEvents = [];
		document.addEventListener('qHmr', (event) => {
			document.__qwikSmokeHmrEvents.push(event.detail);
		});
	});

	await writeFile(homeFile, originalHomeSource.replace(initialText, marker));
	const qHmrEventPromise = page.waitForFunction(
		() => document.__qwikSmokeHmrEvents?.length ?? 0,
		undefined,
		{ timeout: waitTimeout },
	);
	const [, qHmrEvents] = await Promise.all([expectH1Text(page, marker), qHmrEventPromise]);
	const eventCount = await qHmrEvents.jsonValue();
	await page.waitForTimeout(750);

	if (eventCount < 1) {
		throw new Error('Expected at least one browser qHmr event.');
	}
	if (navigationsAfterInitialLoad !== 0) {
		throw new Error(
			`Expected zero post-initial navigations, saw ${navigationsAfterInitialLoad}.`,
		);
	}

	console.log(
		`Observed ${eventCount} qHmr event(s) and updated h1 to ${JSON.stringify(marker)}.`,
	);
} finally {
	if (originalHomeSource !== undefined) {
		await writeFile(homeFile, originalHomeSource);
	}
	await browser?.close();
	await server?.close();
	await releaseLock?.();
}

async function expectH1Text(page, text) {
	await page.waitForFunction(
		(expected) => document.querySelector('h1')?.textContent === expected,
		text,
		{ timeout: waitTimeout },
	);
}
