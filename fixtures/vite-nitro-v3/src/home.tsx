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
			<button
				onKeyDown$={() => {
					console.log('KEY');
				}}
				onClick$={() => console.log('hey')}
			>
				New Count {newCount.value}
			</button>
			<div>hey</div>
		</main>
	);
});
