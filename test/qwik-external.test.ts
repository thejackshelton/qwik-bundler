import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { build } from 'rolldown';
import { expect, test, vi } from 'vitest';
import { qwikServer } from '../src/rolldown';
import { callOptions, callResolveId } from './helpers';

const fixtureDir = resolve('fixtures/rolldown-library-consumer');

test('resolves matched server externals before deciding whether to bundle Qwik output', async () => {
	const options = { external: [/@fixtures\/rolldown-library/g, 'hono'] };
	const plugin = qwikServer({ rootDir: fixtureDir });
	const resolve = vi.fn((id: string) => {
		if (id === '@fixtures/rolldown-library') {
			return Promise.resolve({
				id: '/workspace/node_modules/@fixtures/rolldown-library/lib/index.qwik.mjs',
			});
		}
		return Promise.resolve({ id: `/workspace/node_modules/${id}/index.mjs` });
	});

	callOptions(plugin, options);
	const external = options.external as unknown as (
		id: string,
		parentId: string | undefined,
		isResolved: boolean,
	) => boolean | null | undefined;

	expect(typeof options.external).toBe('function');
	expect(external('@fixtures/rolldown-library', 'src/server.ts', false)).toBe(false);
	expect(external('hono', 'src/server.ts', false)).toBe(false);
	expect(
		external(
			'/workspace/node_modules/@fixtures/rolldown-library/lib/index.qwik.mjs',
			'src/server.ts',
			true,
		),
	).toBe(false);
	expect(
		await callResolveId(plugin, '@fixtures/rolldown-library', 'src/server.ts', { resolve }),
	).toEqual({
		external: false,
		id: '/workspace/node_modules/@fixtures/rolldown-library/lib/index.qwik.mjs',
	});
	expect(await callResolveId(plugin, 'hono', 'src/server.ts', { resolve })).toEqual({
		id: 'hono',
		external: true,
	});
});

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
