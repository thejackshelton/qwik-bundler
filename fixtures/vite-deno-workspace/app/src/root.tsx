import { component$, useSignal } from '@qwik.dev/core';
import { WorkspaceBadge } from '@fixtures/deno-qwik-lib';

interface RootProps {
	url?: string;
}

export default component$<RootProps>(({ url = '/' }) => {
	const count = useSignal(0);
	return (
		<main>
			<h1>Deno Qwik Fixture</h1>
			<p data-url={url}>Rendered at {url}</p>
			<WorkspaceBadge tone="accent" />
			<button type="button" onClick$={() => count.value++}>
				Count {count.value}
			</button>
		</main>
	);
});
