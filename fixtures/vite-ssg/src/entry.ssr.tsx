import { renderToString } from '@qwik.dev/core/server';
import Root from './root';

export async function render(url: string) {
	const result = await renderToString(<Root url={url} />, {
		containerAttributes: { lang: 'en-us' },
	});
	return result.html;
}
