import { readFile, rm } from 'node:fs/promises';
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
});

async function execPnpm(args: string[]) {
	try {
		await exec('pnpm', args, { cwd: root });
	} catch (error) {
		const next = error as Error & { stdout?: string; stderr?: string };
		throw new Error([next.message, next.stdout, next.stderr].filter(Boolean).join('\n'));
	}
}
