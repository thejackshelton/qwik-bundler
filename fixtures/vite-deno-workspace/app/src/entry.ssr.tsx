import { renderToString } from '@qwik.dev/core/server';
import Root from './root.tsx';

type RenderOptions = NonNullable<Parameters<typeof renderToString>[1]>;

export async function render(url = '/', manifest?: RenderOptions['manifest']) {
	const result = await renderToString(
		<>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Deno Qwik Fixture</title>
				<link rel="canonical" href={url} />
			</head>
			<body>
				<Root url={url} />
			</body>
		</>,
		{
			containerAttributes: { lang: 'en-us' },
			manifest,
		},
	);
	return result.html;
}
