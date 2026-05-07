import { component$ } from '@qwik.dev/core';
import './global.css';
import Home from './home';

interface RootProps {
	url?: string;
}

const Root = component$<RootProps>(({ url = '/' }) => {
	return (
		<>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>Nitro v3 Fixture</title>
				<link rel="canonical" href={url} />
			</head>
			<body>
				<Home />
			</body>
		</>
	);
});

export default Root;
