import { renderToString } from '@qwik.dev/core/server';
import { H3, eventHandler, html, serveStatic } from 'h3';
import { toNodeHandler } from 'h3/node';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createDocument } from './root';

export const app = new H3();
const distUrl = new URL('../dist/', import.meta.url);

function getAssetUrl(id: string) {
	return new URL(`.${id}`, distUrl);
}

app.use(
	'/build/**',
	eventHandler((event) =>
		serveStatic(event, {
			getContents: (id) => readFile(getAssetUrl(id)),
			getMeta: async (id) => {
				const stats = await stat(getAssetUrl(id)).catch(() => undefined);
				return stats?.isFile() ? { mtime: stats.mtime, size: stats.size } : undefined;
			},
		}),
	),
);

app.use(
	'/',
	eventHandler(async (event) => {
		const url = event.url.pathname + event.url.search;
		const result = await renderToString(createDocument(url), {
			containerAttributes: { lang: 'en-us' },
		});

		return html(result.html);
	}),
);

if (import.meta.url === `file://${process.argv[1]}`) {
	const port = Number(process.env.PORT ?? 4173);
	createServer(toNodeHandler(app)).listen(port, () => {
		console.log(`h3 fixture listening on http://localhost:${port}`);
	});
}
