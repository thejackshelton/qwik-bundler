import { component$ } from '@qwik.dev/core';
import FixtureContent, { type FixtureContentProps } from './content';
import './style.css';

const Root = component$<FixtureContentProps>(({ url = '/', version = 'initial' }) => {
	return (
		<>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Vite SSG Fixture</title>
			</head>
			<body>
				<FixtureContent url={url} version={version} />
			</body>
		</>
	);
});

export default Root;
