import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
	const count = useSignal(0);

	return (
		<main>
			<h1>Vite Direct Fixture</h1>
			<p>This app validates the Vite plugin directly.</p>
			<button onClick$={() => count.value++}>Count {count.value}</button>
			<button onClick$={() => count.value++}>Count {count.value}</button>
			<div>HEY</div>
		</main>
	);
});
