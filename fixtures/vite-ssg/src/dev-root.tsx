import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
	const count = useSignal(0);
	return (
		<main>
			<h1>Vite SSG Fixture</h1>
			<p>Dev render</p>
			<button onClick$={() => count.value++}>Count {count.value}</button>
		</main>
	);
});
