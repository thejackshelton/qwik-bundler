import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
	const count = useSignal(0);

	return (
		<main>
			<h1>Vite Workerd Fixture</h1>
			<p>This app validates Qwik SSR output for a Cloudflare Worker-style runtime.</p>
			<button onClick$={() => console.log('hey')}>Count {count.value}</button>
			<button onClick$={() => count.value++}>Count {count.value}</button>
		</main>
	);
});
