import { readFile } from 'node:fs/promises';

const wranglerConfig = JSON.parse(
	await readFile(
		new URL(
			'../fixtures/vite-workerd/dist/vite_workerd_fixture/wrangler.json',
			import.meta.url,
		),
		'utf8',
	),
);
const worker = await import(
	new URL(
		`../fixtures/vite-workerd/dist/vite_workerd_fixture/${wranglerConfig.main}`,
		import.meta.url,
	)
).then((module) => module.default);

const response = await worker.fetch(new Request('https://fixture.test/'), {
	ASSETS: {
		fetch: () => new Response('Not found', { status: 404 }),
	},
});

if (!response.ok) {
	throw new Error(`Expected successful Workerd response, got ${response.status}.`);
}

const html = await response.text();
for (const expected of ['Vite Workerd Fixture', 'Cloudflare Worker-style runtime', 'q:container']) {
	if (!html.includes(expected)) {
		throw new Error(`Expected Workerd HTML to include ${JSON.stringify(expected)}.`);
	}
}

console.log('Vite Workerd fixture rendered SSR HTML successfully.');
process.exit(0);
