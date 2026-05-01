import { component$, Slot } from '@qwik.dev/core';

export const Card = component$(() => {
	return (
		<section class="fixture-card">
			<Slot />
		</section>
	);
});

export const Badge = component$<{ tone?: 'neutral' | 'accent' }>(({ tone = 'neutral' }) => {
	return <span data-tone={tone}>Rolldown library badge</span>;
});
