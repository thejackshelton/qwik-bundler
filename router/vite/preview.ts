import { join, resolve } from 'pathe';
import type { Connect, PreviewServer } from 'vite';

export interface RouterPreviewOptions {
	/** Directory containing the SSR preview build. Defaults to `server`. */
	ssrOutDir?: string;
	/** Basename of the preview entry module. Defaults to `entry.preview`. */
	entry?: string;
	/** Module extensions checked for the preview entry. */
	extensions?: string[];
}

export async function configureRouterPreviewServer(
	server: PreviewServer,
	rootDir: string,
	options: RouterPreviewOptions = {},
) {
	const ssrOutDir = resolve(rootDir, options.ssrOutDir ?? 'server');
	const entry = options.entry ?? 'entry.preview';
	const extensions = options.extensions ?? ['mjs', 'cjs', 'js'];

	const errors: unknown[] = [];
	for (const entryModulePath of extensions.map((ext) => join(ssrOutDir, `${entry}.${ext}`))) {
		try {
			const mod = await import(fileUrl(entryModulePath));
			const middleware = resolvePreviewMiddleware(mod.default);
			if (!middleware) {
				return invalidPreviewMessage(
					server.middlewares,
					`Entry preview module "${entryModulePath}" does not export a default middleware function`,
				);
			}
			server.middlewares.use(middleware);
			return;
		} catch (error) {
			errors.push(error);
		}
	}

	return invalidPreviewMessage(
		server.middlewares,
		`Unable to find output "${ssrOutDir}/${entry}" module.\n\nPlease ensure "src/${entry}.tsx" has been built before running "vite preview".\n\n${errors.map(String).join('\n')}`,
	);
}

function fileUrl(path: string) {
	try {
		return new URL(path, 'file://').href;
	} catch {
		return new URL(`/${path}`, 'file://').href;
	}
}

function resolvePreviewMiddleware(value: unknown): Connect.HandleFunction | null {
	if (typeof value === 'function') {
		return value as Connect.HandleFunction;
	}
	if (value && typeof value === 'object' && 'router' in value) {
		const router = (value as { router?: unknown }).router;
		if (typeof router === 'function') {
			return router as Connect.HandleFunction;
		}
	}
	return null;
}

function invalidPreviewMessage(middlewares: Connect.Server, message: string) {
	middlewares.use((_, res) => {
		res.writeHead(400, { 'Content-Type': 'text/plain' });
		res.end(message);
	});
}
