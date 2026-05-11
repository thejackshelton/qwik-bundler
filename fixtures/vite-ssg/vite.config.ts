import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, resolve } from 'pathe';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { qwik } from 'qwik-bundler/vite';

const execFileAsync = promisify(execFile);

export default defineConfig({
	plugins: [qwik(), prerender()],
	builder: {},
	environments: {
		client: {
			consumer: 'client',
			build: {
				rolldownOptions: {
					input: 'index.html',
				},
			},
		},
		ssr: {
			consumer: 'server',
			build: {
				outDir: 'dist/ssr',
				rolldownOptions: {
					input: 'src/entry.ssr.tsx',
					output: { entryFileNames: 'entry.ssr.mjs' },
				},
			},
		},
	},
});

function prerender(): Plugin {
	return {
		name: 'fixture:ssg-prerender',
		buildApp: {
			order: 'post',
			async handler(builder) {
				const client = builder.environments.client;
				if (!client) {
					throw new Error('Expected client environment');
				}
				if (!client.isBuilt) {
					await builder.build(client);
				}

				const ssr = builder.environments.ssr;
				if (!ssr) throw new Error('Expected ssr environment');
				await builder.build(ssr);

				const root = builder.config.root;
				const html = await renderInChildProcess(resolve(root, 'dist/ssr/entry.ssr.mjs'));
				const file = resolve(root, 'dist/index.html');
				await mkdir(dirname(file), { recursive: true });
				await writeFile(file, html);
			},
		},
	};
}

async function renderInChildProcess(entry: string) {
	const code = `
const { render } = await import(${JSON.stringify(entry)});
const html = await render('/ssg');
process.stdout.write(html);
process.exit(0);
`;
	const { stdout } = await execFileAsync(
		process.execPath,
		['--input-type=module', '--eval', code],
		{
			maxBuffer: 1024 * 1024,
		},
	);
	return stdout;
}
