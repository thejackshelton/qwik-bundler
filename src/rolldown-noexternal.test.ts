import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { build } from 'rolldown';
import { expect, test } from 'vitest';
import { qwikServer } from './rolldown';

const fixtureDir = resolve('fixtures/rolldown-library-consumer');

test('keeps Qwik dependency packages bundled in SSR output', async () => {
	const outDir = await mkdtemp(join(tmpdir(), 'qwik-bundler-noexternal-'));

	try {
		await build({
			cwd: fixtureDir,
			input: 'src/server.ts',
			output: {
				dir: outDir,
				entryFileNames: 'server.js',
				format: 'esm',
			},
			platform: 'node',
			resolve: {
				conditionNames: ['development', 'import', 'node', 'default'],
			},
			external: [
				/^node:/,
				'@hono/node-server',
				'@hono/node-server/serve-static',
				'hono',
				'@fixtures/rolldown-library',
			],
			plugins: [qwikServer()],
		});

		const serverCode = await readFile(join(outDir, 'server.js'), 'utf-8');
		const hasExternalQwikLibrary = /from\s+["']@fixtures\/rolldown-library["']/.test(
			serverCode,
		);

		expect(hasExternalQwikLibrary).toBe(false);
	} finally {
		await rm(outDir, { recursive: true, force: true });
	}
});
