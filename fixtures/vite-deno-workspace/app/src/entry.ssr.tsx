import { renderToString } from '@qwik.dev/core/server';
import Root from './root.tsx';

type RenderOptions = NonNullable<Parameters<typeof renderToString>[1]>;

export async function render(url = '/', manifest?: RenderOptions['manifest']) {
	const result = await renderToString(<Root url={url} />, {
		containerAttributes: { lang: 'en-us' },
		manifest,
	});
	return result.html;
}
