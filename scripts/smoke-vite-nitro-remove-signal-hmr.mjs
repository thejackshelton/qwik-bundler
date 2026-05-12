import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
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
	const countSignal = /\n\s*const count = useSignal\(0\);/;
	const countButton =
		/\n\s*<button onClick\$=\{\(\) => count\.value\+\+\}>Count \{count\.value\}<\/button>/;
	const withCount = countSignal.test(originalHomeSource)
		? originalHomeSource
		: originalHomeSource.replace(
				'export default component$(() => {',
				'export default component$(() => {\n\tconst count = useSignal(0);',
			);
	const withButton = countButton.test(withCount)
		? withCount
		: withCount.replace(
				'</p>',
				'</p>\n\t\t\t<button onClick$={() => count.value++}>Count {count.value}</button>',
			);
	const withoutButton = withButton.replace(countButton, '');

	await writeFile(homeFile, withButton);
	server = await createServer({
		root: fixtureRoot,
		configFile,
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();

	browser = await chromium.launch();
	const page = await browser.newPage();
	await page.goto(server.resolvedUrls.local[0], {
		waitUntil: 'networkidle',
		timeout: waitTimeout,
	});

	for (let i = 0; i < 8; i++) await page.getByText(/^Count/).click();
	await page.waitForFunction(() => document.body.textContent.includes('Count 8'), undefined, {
		timeout: waitTimeout,
	});

	await writeFile(homeFile, withoutButton);
	await page.waitForFunction(() => !document.body.textContent.includes('Count 8'), undefined, {
		timeout: waitTimeout,
	});
	await page.waitForFunction(() => document.body.textContent.includes('New Count 0'), undefined, {
		timeout: waitTimeout,
	});

	await writeFile(homeFile, withButton);
	await page.waitForFunction(() => document.body.textContent.includes('Count 8'), undefined, {
		timeout: waitTimeout,
	});

	console.log('Removed button HMR preserved Count 8 and kept New Count at 0.');
} finally {
	if (originalHomeSource !== undefined) await writeFile(homeFile, originalHomeSource);
	await browser?.close();
	await server?.close();
	await releaseLock?.();
}

process.exit(0);
