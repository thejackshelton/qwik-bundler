import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import process from 'node:process';

const scanRoots = [
	'fixtures/vite-csr/dist',
	'fixtures/vite-nitro-v3/.output',
	'fixtures/vite-library/dist',
	'fixtures/rolldown-library-consumer/rolldown-library/lib',
];

const textExtensions = new Set(['.js', '.mjs', '.cjs', '.html', '.json', '.css', '.map']);

const forbiddenStrings = [
	['virtual bridge module', 'virtual:qwik-hmr-bridge'],
	['Qwik HMR custom event', 'qwik:hmr'],
	['Qwik browser HMR event', 'qHmr'],
	['Vite self accept', 'import.meta.hot.accept('],
	['Qwik HMR timestamp marker', 'document.__hmrT'],
	['reload fallback', 'location.reload'],
];

const rootDir = process.cwd();
const matches = [];
const failures = [];

for (const root of scanRoots) {
	await scanRoot(root);
}

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exitCode = 1;
} else if (matches.length > 0) {
	console.error('Found forbidden Qwik HMR strings in generated fixture artifacts:');
	for (const match of matches) {
		console.error(`- ${match.file}: ${match.label} (${JSON.stringify(match.value)})`);
	}
	process.exitCode = 1;
} else {
	console.log('No forbidden Qwik HMR strings found in generated fixture artifacts.');
}

async function scanRoot(root) {
	const absoluteRoot = resolve(rootDir, root);

	try {
		await scanDirectory(absoluteRoot);
	} catch (error) {
		if (error && error.code === 'ENOENT') {
			failures.push(`Missing generated output directory: ${root}`);
			return;
		}

		throw error;
	}
}

async function scanDirectory(directory) {
	const entries = await readdir(directory, { withFileTypes: true });

	for (const entry of entries) {
		const file = join(directory, entry.name);

		if (entry.isDirectory()) {
			await scanDirectory(file);
			continue;
		}

		if (!entry.isFile() || !isTextLikeFile(file)) continue;

		await scanFile(file);
	}
}

async function scanFile(file) {
	let source;

	try {
		source = await readFile(file, 'utf8');
	} catch (error) {
		if (error && error.code === 'ERR_INVALID_ARG_VALUE') return;
		throw error;
	}

	for (const [label, value] of forbiddenStrings) {
		if (!source.includes(value)) continue;

		matches.push({
			file: relative(rootDir, file),
			label,
			value,
		});
	}
}

function isTextLikeFile(file) {
	return textExtensions.has(extname(file));
}
