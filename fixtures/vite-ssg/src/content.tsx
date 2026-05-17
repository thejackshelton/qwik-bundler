import { component$, useSignal } from '@qwik.dev/core';
import './style.css';

export interface FixtureContentProps {
	url?: string;
	version?: string;
}

const FixtureContent = component$<FixtureContentProps>(({ url = '/', version = 'initial' }) => {
	const count = useSignal(0);
	return (
		<main>
			<h1>Vite SSG Fixture</h1>
			<p data-url={url}>Rendered at {url}</p>
			{url === '/changed' ? <p data-version={version}>Version {version}</p> : null}
			<button onClick$={() => count.value++}>Count {count.value}</button>
		</main>
	);
});

export default FixtureContent;
