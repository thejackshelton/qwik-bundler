// Interactive smoke for the experimental TypeScript optimizer (`qwik-ts-optimizer`).
//
// Boots the vite-qwik-router fixture in dev SSR with `experimental: ['tsOptimizer']`
// (toggled via QWIK_TS_OPTIMIZER), drives it in a real browser, and asserts the
// interactive path works end-to-end against the published optimizer:
//   - the routeLoader$ greeting renders,
//   - the counter's lazy onClick QRL (extracted by the optimizer) resumes and
//     increments on click,
//   - the server$ RPC round-trips (POST 200 + server-side side effect).
//
// Run via `pnpm test:ts-optimizer` (which builds first and holds the fixture lock).
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { acquireLock } from './lib/lock.mjs';

process.env.QWIK_TS_OPTIMIZER = '1';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = resolve(repoRoot, 'fixtures/vite-qwik-router');
const configFile = resolve(fixtureRoot, 'vite.config.ts');
const waitTimeout = 20_000;

// server$ runs in-process under the vite SSR dev server, so its side-effect log
// ('HI') lands on this process's stdout — patch to detect it.
let serverSawHI = false;
const origLog = console.log;
console.log = (...args) => {
	if (args.map(String).join(' ').includes('HI')) serverSawHI = true;
	origLog(...args);
};

const fails = [];
const check = (cond, msg) => {
	origLog(`${cond ? '✅' : '❌'} ${msg}`);
	if (!cond) fails.push(msg);
};

let releaseLock;
let browser;
let server;

try {
	releaseLock = await acquireLock('fixture-vite-qwik-router');

	server = await createServer({
		root: fixtureRoot,
		configFile,
		mode: 'ssr',
		server: { host: '127.0.0.1', port: 0 },
		logLevel: 'warn',
	});
	await server.listen();
	const url = server.resolvedUrls?.local?.[0];
	if (!url) throw new Error('Vite dev server did not report a local URL.');
	origLog('dev server:', url);

	browser = await chromium.launch();
	const page = await browser.newPage();
	await page.goto(url, { waitUntil: 'networkidle', timeout: waitTimeout });

	// routeLoader$ greeting
	await page.locator('h1').waitFor({ state: 'visible', timeout: waitTimeout });
	const h1 = (await page.locator('h1').textContent())?.trim();
	check(h1 === 'Hello from Qwik Router', `routeLoader$ greeting renders ("${h1}")`);

	// Counter: the optimizer-extracted onClick QRL must load + run on click
	const counter = page.locator('button').nth(0);
	check((await counter.textContent())?.trim() === '0', 'counter initial value is 0');

	await counter.click();
	await page.locator('button').nth(0).filter({ hasText: '1' }).waitFor({ timeout: waitTimeout });
	check(true, 'counter increments 0 → 1 on click (onClick QRL resumed)');

	await counter.click();
	await page.locator('button').nth(0).filter({ hasText: '2' }).waitFor({ timeout: waitTimeout });
	check(true, 'counter increments 1 → 2 on second click');

	// server$ RPC: clicking "Test server" fires a POST round-trip
	const respPromise = page
		.waitForResponse((r) => r.request().method() === 'POST', { timeout: waitTimeout })
		.catch(() => null);
	await page.getByRole('button', { name: 'Test server' }).click();
	const resp = await respPromise;
	check(resp != null, 'server$ click triggers a POST request');
	if (resp) check(resp.ok(), `server$ RPC responds ok (HTTP ${resp.status()})`);
	await page.waitForTimeout(500);
	check(serverSawHI, "server$ executed server-side (logged 'HI')");
} catch (err) {
	origLog('❌ smoke threw:', err?.message ?? err);
	fails.push(String(err?.message ?? err));
} finally {
	if (browser) await browser.close();
	if (server) await server.close();
	if (releaseLock) await releaseLock();
}

origLog(
	fails.length === 0
		? '\n✅ ALL INTERACTIVE CHECKS PASSED'
		: `\n❌ ${fails.length} CHECK(S) FAILED`,
);
process.exit(fails.length === 0 ? 0 : 1);
