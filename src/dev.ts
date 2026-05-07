import type { TransformModule } from '@qwik.dev/optimizer';
import { relative } from 'pathe';
import { isEqual, isRelative, parsePath, withLeadingSlash } from 'ufo';
import type { QwikEnvironment } from './rolldown';

export interface QwikDevServer {
	environments?: Record<string, { transformRequest: (url: string) => Promise<unknown> }>;
	transformRequest: (url: string) => Promise<unknown>;
}

type EncodeSegment = (environment: QwikEnvironment, path: string) => string;
type DecodeSegment = (id: string) => { environment: QwikEnvironment; path: string } | null;

interface QwikDevOptions {
	dev?: boolean;
	devServer?: QwikDevServer;
}

const QWIK_CORE = '@qwik.dev/core';
const QWIK_DEV_HANDLERS = '@qwik-handlers';

export function createQwikDev(
	options: QwikDevOptions,
	segments: Map<string, TransformModule>,
	root: () => string | undefined,
	encode: EncodeSegment,
	decode: DecodeSegment,
) {
	const parents = new Map<string, string>();
	const enabled = () => options.dev === true;

	return {
		isEnabled: enabled,
		optimizerInput(code: string, id: string) {
			const path = pathname(id);
			return { code, path, devPath: enabled() ? getDevPath(path, root()) : undefined };
		},
		resolveId(source: string, environment: QwikEnvironment) {
			if (isDevHandlers(source)) {
				return { id: QWIK_DEV_HANDLERS, moduleSideEffects: false };
			}
			if (!enabled()) {
				return null;
			}

			const qrl = parseDevQrl(source);
			if (!qrl) {
				return null;
			}

			const id = encode(environment, qrl.path);
			parents.set(id, qrl.parent);
			return { id, moduleSideEffects: false };
		},
		async load(id: string) {
			if (id === QWIK_DEV_HANDLERS) {
				return `export * from '${QWIK_CORE}';`;
			}
			if (!enabled()) {
				return undefined;
			}

			const key = pathname(id);
			const parent = parents.get(key);
			if (!parent) {
				return undefined;
			}

			let segment = segments.get(key);
			const decoded = decode(key);
			const server = options.devServer;
			if (!segment && decoded && server) {
				await transformDevParent(server, decoded.environment, parent);
				segment = segments.get(key);
			}
			return segment?.code ?? null;
		},
		recordSegment(module: TransformModule, environment: QwikEnvironment) {
			if (!enabled()) {
				return;
			}

			for (const path of devSegmentPaths(module.path, root())) {
				segments.set(encode(environment, path), module);
			}
		},
	};
}

function isDevHandlers(id: string) {
	return isEqual(pathname(id), QWIK_DEV_HANDLERS);
}

function parseDevQrl(id: string): { parent: string; path: string } | null {
	const path = pathname(id);
	const match = /^(?<parent>.*\.[cm]?[jt]sx?)_(?<name>[^/]+)\.js$/.exec(path);
	const parent = match?.groups?.parent;
	return parent ? { parent, path } : null;
}

function devSegmentPaths(path: string, root: string | undefined) {
	const paths = new Set([path, withLeadingSlash(path)]);
	const devPath = getDevPath(path, root);
	if (devPath) {
		paths.add(devPath);
	}
	return paths;
}

function getDevPath(id: string, root: string | undefined) {
	if (!root) {
		return undefined;
	}

	const path = relative(root, id);
	return path && path !== '..' && !isRelative(path) ? withLeadingSlash(path) : undefined;
}

function transformDevParent(server: QwikDevServer, environment: QwikEnvironment, parent: string) {
	const devEnvironment = server.environments?.[environment === 'server' ? 'ssr' : 'client'];
	return devEnvironment?.transformRequest(parent) ?? server.transformRequest(parent);
}

function pathname(id: string) {
	return parsePath(id).pathname;
}
