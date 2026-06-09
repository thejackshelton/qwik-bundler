import { component$ } from '@qwik.dev/core';
import { DocumentHeadTags, RouterOutlet, useLocation, useQwikRouter } from '@qwik.dev/router';
import '../global.css';

export default component$(() => {
	useQwikRouter();
	const { url } = useLocation();

	return (
		<>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<DocumentHeadTags />
				<link rel="canonical" href={url.href} />
			</head>
			<body>
				<RouterOutlet />
			</body>
		</>
	);
});
