import { component$, useSignal } from '@qwik.dev/core';
import './style.css';

interface RootProps {
	url?: string;
}

const Root = component$<RootProps>(({ url = '/' }) => {
	const count = useSignal(0);
	return (
		<>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Vite SSG Fixture</title>
			</head>
			<body>
				<main>
					<h1>Vite SSG Fixture</h1>
					<p data-url={url}>Rendered at {url}</p>
					<button type="button" onClick$={() => count.value++}>
						Count {count.value}
					</button>
				</main>
			</body>
		</>
	);
});

export default Root;
