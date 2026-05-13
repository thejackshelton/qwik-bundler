import { Slot, component$ } from '@qwik.dev/core';

export default component$(() => {
	return (
		<>
			<head>
				<title>Vite Hono SSG Fixture</title>
				<link rel="stylesheet" href="/global.css" />
			</head>
			<body>
				<Slot />
			</body>
		</>
	);
});
