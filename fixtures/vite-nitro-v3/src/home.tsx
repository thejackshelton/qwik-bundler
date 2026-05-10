import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
	const count = useSignal(0);
	const newCount = useSignal(0);
	const thirdState = useSignal(0);

	return (
		<main>
			<h1>Nitro v3 Fixture</h1>
			<p>This app validates the Qwik Vite plugin with the Nitro v3 Vite plugin.</p>
			<button onClick$={() => count.value++}>Count {count.value}</button>
			<button onClick$={() => newCount.value++}>New Count {newCount.value}</button>
		</main>
	);
});
