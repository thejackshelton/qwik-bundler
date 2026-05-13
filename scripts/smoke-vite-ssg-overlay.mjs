import { spawn } from 'node:child_process';
import { cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

const root = process.cwd();
const fixtureRoot = resolve(root, 'fixtures/vite-ssg');
const dist = resolve(fixtureRoot, 'dist');
const previous = resolve(fixtureRoot, 'dist-previous-smoke');
const overlay = resolve(fixtureRoot, 'dist-overlay-smoke');
const fresh = resolve(fixtureRoot, 'dist-fresh-smoke');

await rm(dist, { force: true, recursive: true });
await rm(previous, { force: true, recursive: true });
await rm(overlay, { force: true, recursive: true });
await rm(fresh, { force: true, recursive: true });

await run('pnpm', ['build']);
await run('pnpm', ['--filter', '@fixtures/vite-ssg', 'build'], {
	SSG_PATHS: '/old,/changed',
	SSG_VERSION: 'previous',
});
await cp(dist, previous, { recursive: true });

await rm(dist, { force: true, recursive: true });
await run('pnpm', ['--filter', '@fixtures/vite-ssg', 'build'], {
	SSG_PATHS: '/changed',
	SSG_VERSION: 'fresh',
});
await cp(dist, fresh, { recursive: true });
await cp(previous, overlay, { recursive: true });
await cp(fresh, overlay, { recursive: true });
await rm(dist, { force: true, recursive: true });
await cp(overlay, dist, { recursive: true });

const previewServer = await preview({
	root: fixtureRoot,
	preview: { host: '127.0.0.1', port: 4174, strictPort: true },
});
await waitFor('http://127.0.0.1:4174/old/');

const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});

	await page.goto('http://127.0.0.1:4174/old/', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Count 0' }).click();
	await page.getByRole('button', { name: 'Count 1' }).waitFor();

	if (errors.length > 0) {
		throw new Error(`Browser errors:\n${errors.join('\n')}`);
	}

	console.log('Overlay SSG smoke passed: /old resumed and updated to Count 1.');
} finally {
	await browser.close();
	await new Promise((resolveClose) => previewServer.httpServer.close(resolveClose));
	await rm(previous, { force: true, recursive: true });
	await rm(overlay, { force: true, recursive: true });
	await rm(fresh, { force: true, recursive: true });
}

function run(command, args, env) {
	return new Promise((resolveCommand, reject) => {
		const child = spawn(command, args, {
			cwd: root,
			env: { ...process.env, ...env },
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (data) => (stdout += data));
		child.stderr.on('data', (data) => (stderr += data));
		child.on('close', (code) => {
			if (code === 0) {
				resolveCommand({ stdout, stderr });
				return;
			}

			reject(new Error(`${command} ${args.join(' ')} failed\n${stdout}\n${stderr}`));
		});
	});
}

async function waitFor(url, timeout = 20_000) {
	const startTime = Date.now();
	while (Date.now() - startTime < timeout) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// Retry until Vite preview starts listening.
		}
		await new Promise((resolveWait) => setTimeout(resolveWait, 250));
	}
	throw new Error(`Timed out waiting for ${url}`);
}
