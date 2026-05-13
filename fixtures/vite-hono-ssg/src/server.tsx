import { type Component } from '@qwik.dev/core';
import { type Context, Hono } from 'hono';
import { renderToString } from '@qwik.dev/core/server';
import DocumentRoot from './root';

const app = new Hono();

// Paths that you can also automate in your own way
app.get('/', renderPage(import('./home')));

// noinspection JSUnusedGlobalSymbols - Used by Vite
export default app;

// Somewhere in your engine code:
function renderPage(
	pageImport: Promise<{ default: Component }>,
): (ctx: Context) => Promise<Response> {
	return async (ctx) => {
		const Content = (await pageImport).default;
		return ctx.html(
			(
				await renderToString(
					<DocumentRoot>
						<Content />
					</DocumentRoot>,
				)
			).html,
		);
	};
}
