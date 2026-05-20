import { describe, expect, test } from 'vitest';
import { qwikServer } from '../src/rolldown';
import { callBuildStart, callTransform } from './helpers';

describe('Rolldown server functions', () => {
	test('registers server$ implementations for server RPC lookup', async () => {
		const plugin = qwikServer({ dev: true });

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = await callTransform(
			plugin,
			[
				"import { component$ } from '@qwik.dev/core';",
				"import { server$ } from '@qwik.dev/router';",
				"const testServer$ = server$(() => 'ok');",
				'export default component$(() => <button onClick$={() => testServer$()}>Run</button>);',
			].join('\n'),
			'/workspace/app/src/routes/index.tsx',
		);

		expect(result?.code).toContain('_regSymbol');
		expect(result?.code).toMatch(/const testServer_server_[\w$]+ = .*_regSymbol/);
	});
});
