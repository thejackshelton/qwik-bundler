import { describe, expect, test } from 'vitest';
import { qwikClient } from '../src/rolldown';
import { callBuildStart, callTransform } from './helpers';

describe('Rolldown optimizer strip output', () => {
	test('does not ship route request handler bodies in client output', async () => {
		const plugin = qwikClient({
			optimizerStripNames: {
				client: {
					exports: ['onGet'],
				},
			},
		});

		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = await callTransform(
			plugin,
			`
import { component$ } from '@qwik.dev/core';
import { readFileSync } from 'node:fs';
import secretDb from 'server-only-db';

export const onGet = () => {
	console.log('SERVER_ONLY_ONGET_MARKER', readFileSync('/etc/passwd', 'utf8'), secretDb);
	return { body: 'private' };
};

export default component$(() => <div>public page</div>);
`,
			'/workspace/app/src/routes/index.tsx',
		);

		expect(result?.code).toContain('Symbol removed by Qwik Optimizer');
		expect(result?.code).not.toContain('SERVER_ONLY_ONGET_MARKER');
		expect(result?.code).not.toContain('node:fs');
		expect(result?.code).not.toContain('server-only-db');
	});
});
