import { renderToString } from '@qwik.dev/core/server';
import type { SymbolMapperFn } from '@qwik.dev/core/optimizer';
import serverAssets from './entry-server?assets=ssr';
import clientAssets from './root?assets=client';
import Root from './root';

export default {
	async fetch(request: Request) {
		const assets = clientAssets.merge(serverAssets);
		const { pathname } = new URL(request.url);
		const result = await renderToString(<Root url={pathname} />, {
			base: import.meta.env.DEV ? '/' : undefined,
			containerAttributes: { lang: 'en-us' },
			symbolMapper: import.meta.env.DEV ? devSymbolMapper : undefined,
		});

		return new Response(injectAssets(result.html, assets), {
			headers: { 'Content-Type': 'text/html;charset=utf-8' },
		});
	},
};

function injectAssets(html: string, assets: NitroAssets) {
	const tags = [
		...assets.css.map((attributes) => `<link rel="stylesheet"${renderAttributes(attributes)}>`),
		...assets.js.map(
			(attributes) => `<link rel="modulepreload"${renderAttributes(attributes)}>`,
		),
	].join('');

	return html.replace('</head>', `${tags}</head>`);
}

const devSymbolMapper: SymbolMapperFn = (symbolName, _mapper, parent) => {
	if (symbolName.startsWith('_') && symbolName.length < 6) {
		return [symbolName, '@qwik-handlers'];
	}

	if (!parent) {
		return;
	}

	return [symbolName, `${parent.startsWith('/') ? parent.slice(1) : parent}_${symbolName}.js`];
};

function renderAttributes(attributes: NitroAssetAttributes) {
	return Object.entries(attributes)
		.map(([name, value]) => {
			if (value === true) {
				return ` ${name}`;
			}

			if (value === false || value === undefined) {
				return '';
			}

			return ` ${name}="${escapeAttribute(value)}"`;
		})
		.join('');
}

function escapeAttribute(value: string) {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
