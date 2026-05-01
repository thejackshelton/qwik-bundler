import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
	const count = useSignal(0);

	return (
		<main>
			<h1>Rolldown h3 Fixture</h1>
			<p>This app validates Qwik optimizer output through Rolldown and h3.</p>
			<button onClick$={() => count.value++}>Count {count.value}</button>
		</main>
	);
});
