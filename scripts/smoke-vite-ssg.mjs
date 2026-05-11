import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('fixtures/vite-ssg');
const html = await readFile(resolve(root, 'dist/index.html'), 'utf8');

for (const value of [
	'q:container="paused"',
	'q:manifest-hash=',
	'/build/bundle-graph.json',
	'/build/q-',
]) {
	if (!html.includes(value)) {
		throw new Error(`Expected prerendered SSG HTML to include ${value}`);
	}
}

console.log('Vite SSG fixture prerendered with Qwik client manifest assets.');
