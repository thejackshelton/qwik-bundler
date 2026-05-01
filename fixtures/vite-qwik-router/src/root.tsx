import { component$ } from '@qwik.dev/core';
import { QwikRouterProvider, RouterOutlet } from '@qwik.dev/router';

export default component$(() => {
	return (
		<QwikRouterProvider>
			<RouterOutlet />
		</QwikRouterProvider>
	);
});
