import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
	const count = useSignal(0);

	return (
		<main>
			<h1>Vite Plus Fixture</h1>
			<p>This app validates the Vite plugin through Vite Plus.</p>
			<button onClick$={() => count.value++}>Count {count.value}</button>
		</main>
	);
});
