import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useGreeting = routeLoader$(() => 'Hello from Qwik Router');

export default component$(() => {
	const greeting = useGreeting();

	return (
		<main>
			<h1>{greeting.value}</h1>
			<p>This fixture validates Qwik Router through its Vite plugin.</p>
		</main>
	);
});
