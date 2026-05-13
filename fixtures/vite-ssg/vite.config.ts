import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, resolve } from 'pathe';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { qwik } from 'qwik-bundler/vite';

const execFileAsync = promisify(execFile);

export default defineConfig(({ command }) => {
	if (command === 'serve') {
		return { plugins: [qwik()] };
	}

	return {
		plugins: [qwik(), prerender()],
		builder: {},
		environments: {
			client: {
				consumer: 'client',
				build: {
					rolldownOptions: {
						input: ['index.html', 'src/content.tsx'],
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
	};
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
				const entry = resolve(root, 'dist/ssr/entry.ssr.mjs');
				for (const route of ssgRoutes()) {
					const html = await renderInChildProcess(entry, route);
					const file = resolve(root, 'dist', routeFile(route));
					await mkdir(dirname(file), { recursive: true });
					await writeFile(file, html);
				}
			},
		},
	};
}

function ssgRoutes() {
	return (process.env.SSG_PATHS ?? '/,/old,/changed')
		.split(',')
		.map((route) => route.trim())
		.filter(Boolean);
}

function routeFile(route: string) {
	return route === '/' ? 'index.html' : `${route.replace(/^\/+/, '')}/index.html`;
}

async function renderInChildProcess(entry: string, route: string) {
	const code = `
const { render } = await import(${JSON.stringify(entry)});
const html = await render(${JSON.stringify(route)});
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
