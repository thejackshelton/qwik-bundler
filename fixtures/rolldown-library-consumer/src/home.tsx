import { component$, useSignal } from '@qwik.dev/core';
import { Badge, Card } from '@fixtures/rolldown-library';

export default component$(() => {
	const count = useSignal(0);

	return (
		<main>
			<h1>Rolldown Library Consumer Fixture</h1>
			<Card>
				<p>This app imports precompiled components from the Rolldown library fixture.</p>
				<Badge tone="accent" />
			</Card>
			<button onClick$={() => count.value++}>Count {count.value}</button>
		</main>
	);
});
