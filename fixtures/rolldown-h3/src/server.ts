import { renderToString } from '@qwik.dev/core/server';
import { createApp, eventHandler, toNodeListener } from 'h3';
import { createServer } from 'node:http';
import { createDocument } from './root';

export const app = createApp();

app.use(
	'/',
	eventHandler(async (event) => {
		const url = event.node.req.url ?? '/';
		const result = await renderToString(createDocument(url), {
			containerAttributes: { lang: 'en-us' },
		});

		event.node.res.setHeader('content-type', 'text/html; charset=utf-8');
		return result.html;
	}),
);

if (import.meta.url === `file://${process.argv[1]}`) {
	const port = Number(process.env.PORT ?? 4173);
	createServer(toNodeListener(app)).listen(port, () => {
		console.log(`h3 fixture listening on http://localhost:${port}`);
	});
}
