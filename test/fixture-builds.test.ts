import { cp, readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, test } from 'vitest';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '..');

const fixtures = [
	{
		filter: '@fixtures/vite-nitro-v3',
		outputs: ['fixtures/vite-nitro-v3/.output', 'fixtures/vite-nitro-v3/node_modules/.nitro'],
		manifest: 'fixtures/vite-nitro-v3/.output/public/q-manifest.json',
	},
	{
		filter: '@fixtures/vite-workerd',
		outputs: ['fixtures/vite-workerd/dist'],
		manifest: 'fixtures/vite-workerd/dist/client/q-manifest.json',
	},
	{
		filter: '@fixtures/vite-ssg',
		outputs: ['fixtures/vite-ssg/dist'],
	},
	{
		filter: '@fixtures/rolldown-h3',
		outputs: ['fixtures/rolldown-h3/dist', 'fixtures/rolldown-h3/server'],
	},
	{
		filter: '@fixtures/rolldown-hono',
		outputs: ['fixtures/rolldown-hono/dist', 'fixtures/rolldown-hono/server'],
	},
	{
		filter: '@fixtures/rolldown-library-consumer',
		outputs: [
			'fixtures/rolldown-library-consumer/dist',
			'fixtures/rolldown-library-consumer/server',
		],
	},
] as const;

describe('fixture builds', () => {
	beforeAll(async () => {
		await execPnpm(['build']);
	}, 120_000);

	for (const fixture of fixtures) {
		test(`${fixture.filter} builds from a clean output directory`, async () => {
			await Promise.all(
				fixture.outputs.map((output) =>
					rm(resolve(root, output), {
						force: true,
						recursive: true,
					}),
				),
			);

			await execPnpm(['--filter', fixture.filter, 'build']);

			if (fixture.manifest) {
				const manifest = JSON.parse(
					await readFile(resolve(root, fixture.manifest), 'utf8'),
				);
				expect(manifest.preloader).toBeTruthy();
				expect(manifest.core).toBeTruthy();
				expect(manifest.preloader).not.toBe(manifest.core);
			}
		}, 120_000);
	}

	test('@fixtures/vite-ssg supports overlaying partial SSG output onto a fresh client build', async () => {
		const fixtureRoot = resolve(root, 'fixtures/vite-ssg');
		const dist = resolve(fixtureRoot, 'dist');
		const previous = resolve(fixtureRoot, 'dist-previous');
		const overlay = resolve(fixtureRoot, 'dist-overlay');

		try {
			await Promise.all([
				rm(dist, { force: true, recursive: true }),
				rm(previous, { force: true, recursive: true }),
				rm(overlay, { force: true, recursive: true }),
			]);

			await execPnpm(['--filter', '@fixtures/vite-ssg', 'build'], {
				SSG_PATHS: '/old,/changed',
				SSG_VERSION: 'previous',
			});
			await cp(dist, previous, { recursive: true });
			const oldHtml = await readFile(resolve(previous, 'old/index.html'), 'utf8');
			const oldReferences = qrlReferences(oldHtml);
			expect(oldHtml).toContain('Rendered at /old');
			expect(oldReferences.length).toBeGreaterThan(0);

			await rm(dist, { force: true, recursive: true });
			await execPnpm(['--filter', '@fixtures/vite-ssg', 'build'], {
				SSG_PATHS: '/changed',
				SSG_VERSION: 'fresh',
			});
			await expect(readFile(resolve(dist, 'old/index.html'), 'utf8')).rejects.toThrow();
			const freshManifest = JSON.parse(
				await readFile(resolve(dist, 'q-manifest.json'), 'utf8'),
			);

			await cp(previous, overlay, { recursive: true });
			await cp(dist, overlay, { recursive: true });

			const unchangedOldHtml = await readFile(resolve(overlay, 'old/index.html'), 'utf8');
			const changedHtml = await readFile(resolve(overlay, 'changed/index.html'), 'utf8');
			const bundleGraph = JSON.parse(
				await readFile(resolve(overlay, freshManifest.bundleGraphAsset), 'utf8'),
			);
			const chunks = new Set(await readdir(resolve(overlay, 'build')));

			expect(unchangedOldHtml).toBe(oldHtml);
			expect(changedHtml).toContain('Version fresh');
			expect(changedHtml).not.toContain('Version previous');
			expect(freshManifest.manifestHash).toEqual(expect.any(String));
			expect(freshManifest.bundleGraphAsset).toBe('build/bundle-graph.json');
			for (const reference of oldReferences) {
				expect(freshManifest.mapping).toHaveProperty(reference.symbol);
				if (!isInternalQrl(reference.symbol)) {
					expect(bundleGraph).toContain(symbolHash(reference.symbol));
				}
				expect(chunks.has(reference.chunk)).toBe(true);
			}
		} finally {
			await Promise.all([
				rm(previous, { force: true, recursive: true }),
				rm(overlay, { force: true, recursive: true }),
			]);
		}
	}, 120_000);
});

function qrlReferences(html: string) {
	return Array.from(html.matchAll(/q-[\w-]+\.js#[\w$]+#\d+/g), ([match]) => {
		const [chunk, symbol] = match.split('#');
		if (!chunk || !symbol) throw new Error(`Invalid QRL reference: ${match}`);
		return { chunk, symbol };
	});
}

function symbolHash(symbol: string) {
	return symbol.slice(symbol.lastIndexOf('_') + 1);
}

function isInternalQrl(symbol: string) {
	return symbol.startsWith('_') && symbol.length < 10;
}

async function execPnpm(args: string[], env?: NodeJS.ProcessEnv) {
	try {
		await exec('pnpm', args, { cwd: root, env: { ...process.env, ...env } });
	} catch (error) {
		const next = error as Error & { stdout?: string; stderr?: string };
		throw new Error([next.message, next.stdout, next.stderr].filter(Boolean).join('\n'));
	}
}
