import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = 'fixtures/vite-direct';

await runFixture('dev');
await exec('pnpm', ['--dir', fixture, 'build']);
await runFixture('preview');
console.log('CSR interactivity passed: vite-direct dev and preview');

async function runFixture(command) {
	const port = await getPort();
	const server = await startServer(command, port);
	const url = `http://127.0.0.1:${port}`;

	try {
		await agent(['close', '--all']).catch(() => undefined);
		await agent(['open', url]);
		await agent(['wait', '--load', 'domcontentloaded']);
		await waitText('Vite Direct Fixture');
		await waitText('Count 0');
		await waitEval('document.body.contains(document.querySelector("main"))');
		await waitEval('document.querySelector("errored-host") === null');
		await clickUntilText('button', 'Count 1');
		await assertNoBrowserFailures();
	} finally {
		server.kill('SIGTERM');
		await once(server, 'exit').catch(() => undefined);
		await agent(['close', '--all']).catch(() => undefined);
	}
}

async function startServer(command, port) {
	const child = spawn(
		'pnpm',
		[
			'--dir',
			fixture,
			'exec',
			'vite',
			...(command === 'preview' ? ['preview'] : []),
			'--host',
			'127.0.0.1',
			'--port',
			String(port),
			'--strictPort',
		],
		{ cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
	);
	let output = '';
	child.stdout.on('data', (chunk) => {
		output += chunk;
	});
	child.stderr.on('data', (chunk) => {
		output += chunk;
	});

	try {
		await waitFor(async () => {
			if (child.exitCode !== null)
				throw new Error(`${command} exited with ${child.exitCode}`);
			try {
				return (await fetch(`http://127.0.0.1:${port}`)).ok;
			} catch {
				return false;
			}
		}, `${command} server\n${output}`);
	} catch (error) {
		child.kill('SIGTERM');
		throw error;
	}

	return child;
}

function getPort() {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			server.close(() => {
				if (address && typeof address === 'object') resolvePort(address.port);
				else reject(new Error('Failed to allocate test port'));
			});
		});
	});
}

async function waitText(text) {
	await waitEval(`document.body?.innerText.includes(${JSON.stringify(text)}) === true`);
}

async function clickUntilText(selector, text) {
	await waitFor(async () => {
		await agent(['click', selector]);
		await delay(100);
		return Boolean(
			parseAgentValue(
				await agent([
					'eval',
					`document.body?.innerText.includes(${JSON.stringify(text)}) === true`,
				]),
			),
		);
	}, text);
}

async function waitEval(expression) {
	await waitFor(
		async () => Boolean(parseAgentValue(await agent(['eval', expression]))),
		expression,
	);
}

async function assertNoBrowserFailures() {
	const errors = JSON.parse(await agent(['errors', '--json'])).data?.errors ?? [];
	const consoleErrors = (
		JSON.parse(await agent(['console', '--json'])).data?.messages ?? []
	).filter((message) => message.type === 'error');
	if (errors.length || consoleErrors.length) {
		throw new Error(`Browser failures: ${JSON.stringify({ errors, consoleErrors }, null, 2)}`);
	}
}

function agent(args) {
	return exec('agent-browser', args);
}

function exec(command, args) {
	return new Promise((resolvePromise, reject) => {
		execFile(command, args, { cwd: root }, (error, stdout, stderr) => {
			if (error) reject(new Error(`${command} ${args.join(' ')} failed\n${stdout}${stderr}`));
			else resolvePromise(stdout.trim());
		});
	});
}

async function waitFor(check, label, timeout = 30000) {
	const started = Date.now();
	let lastError;
	while (Date.now() - started < timeout) {
		try {
			if (await check()) return;
		} catch (error) {
			lastError = error;
		}
		await delay(250);
	}
	throw new Error(`Timed out waiting for ${label}${lastError ? `\n${lastError.stack}` : ''}`);
}

function parseAgentValue(output) {
	const value = output.trim();
	if (value === 'true') return true;
	if (value === 'false') return false;
	if (!value) return undefined;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}
