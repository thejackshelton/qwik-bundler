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
			<select onChange$={(newValue) => console.log('changed', newValue)}>
				<option value="1">Option 1</option>
				<option value="2">Option 2</option>
				<option value="3">Option 3</option>
			</select>
		</main>
	);
});
