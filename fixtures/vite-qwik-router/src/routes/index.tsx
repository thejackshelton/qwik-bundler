import { component$, useSignal } from '@qwik.dev/core';
import { routeLoader$, server$ } from '@qwik.dev/router';

export const useGreeting = routeLoader$(() => 'Hello from Qwik Router');

const testServer$ = server$(() => console.log('HI'));

export default component$(() => {
	const greeting = useGreeting();
	const count = useSignal(0);

	return (
		<main>
			<h1>{greeting.value}</h1>
			<p>This fixture validates Qwik Router through its Vite plugin.</p>
			<button onClick$={() => count.value++}>{count.value}</button>
			<button onClick$={() => testServer$()}>Test server</button>
		</main>
	);
});
