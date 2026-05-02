import { createAdaptorServer } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { renderToString, type RenderToStringOptions } from '@qwik.dev/core/server';
import { Hono } from 'hono';
import { createDocument } from './root';

function render(request: Request, options: RenderToStringOptions = {}) {
	return renderToString(createDocument(request.url), {
		...options,
		containerAttributes: {
			lang: 'en-us',
			...options.containerAttributes,
		},
	});
}

export function createApp({ serveAssets = false } = {}) {
	const app = new Hono();

	if (serveAssets) {
		app.use('*', serveStatic({ root: './dist' }));
	}

	app.get('/', async (context) => {
		const result = await render(context.req.raw);
		return context.html(result.html);
	});

	return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const port = Number(process.env.PORT ?? 4173);
	createAdaptorServer({ fetch: createApp({ serveAssets: true }).fetch }).listen(port, () => {
		console.log(`Library consumer fixture listening on http://localhost:${port}`);
	});
}

export default createApp();
