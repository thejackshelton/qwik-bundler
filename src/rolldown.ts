import {
	createOptimizer,
	type EntryStrategy,
	type OptimizerOptions,
	type SegmentAnalysis,
	type TransformModule,
} from '@qwik.dev/optimizer';
import { dirname, join, resolve } from 'pathe';
import type { InputOptions, OutputOptions, Plugin } from 'rolldown';
import { createManifest, injectManifest, QWIK_MANIFEST, type QwikManifest } from './q-manifest';

export type QwikEnvironment = 'client' | 'server' | 'lib';

export interface QwikRolldownOptions {
	entryStrategy?: EntryStrategy;
	optimizerOptions?: OptimizerOptions;
	rootDir?: string;
}

type EmitFile = (file: { type: 'chunk'; id: string }) => string;
type Environment = QwikEnvironment | ((context: unknown) => QwikEnvironment);

const QWIK_BUILD = '@qwik.dev/core/build';
const QWIK_CORE = '@qwik.dev/core';
const QWIK_HANDLERS = '@qwik.dev/core/handlers.mjs';
const Q_MANIFEST = 'q-manifest.json';
const SEGMENT = '\0qwik:segment:';
const SOURCE_RE = /(?:\.[jt]sx?|\.qwik\.[mj]s)$/;
const manifests = new Map<string, QwikManifest>();

export const qwik = (options?: QwikRolldownOptions) => qwikClient(options);
export const qwikClient = (options: QwikRolldownOptions = {}) => plugin('client', options);
export const qwikServer = (options: QwikRolldownOptions = {}) => plugin('server', options);
export const qwikLib = (options: QwikRolldownOptions = {}) => plugin('lib', options);

export function plugin(environment: Environment, options: QwikRolldownOptions = {}): Plugin {
	const segments = new Map<string, TransformModule>();
	const symbols = new Map<string, SegmentAnalysis>();
	let manifest: QwikManifest | null = null;
	let optimizer: ReturnType<typeof createOptimizer> | undefined;
	let root = options.rootDir;
	let handlers = false;
	let name = 'qwik:rolldown';

	if (typeof environment === 'string') {
		name = `qwik:rolldown:${environment}`;
	}

	function getOptimizer() {
		if (!optimizer) {
			optimizer = createOptimizer(options.optimizerOptions);
		}

		return optimizer;
	}

	function getEnvironment(context: unknown) {
		if (typeof environment === 'function') {
			return environment(context);
		}

		return environment;
	}

	function getRoot() {
		return root ?? options.rootDir;
	}

	return {
		name,
		options(input) {
			return defineQwik(input);
		},
		async buildStart(input) {
			if (!root) {
				root = options.rootDir ?? input.cwd;
			}

			handlers = false;
			const currentRoot = getRoot();
			if (manifest || !currentRoot) {
				return;
			}

			manifest = manifests.get(currentRoot) ?? null;
		},
		outputOptions(output) {
			return outputDefaults(output, getEnvironment(this));
		},
		async resolveId(source, importer) {
			const currentEnvironment = getEnvironment(this);
			if (source === QWIK_BUILD) {
				return QWIK_BUILD;
			}

			if (source.startsWith(SEGMENT)) {
				return source;
			}

			if (isClient(currentEnvironment) && source === QWIK_CORE && !handlers) {
				handlers = true;
				const resolved = await this.resolve(QWIK_HANDLERS, importer, { skipSelf: true });
				if (resolved) {
					this.emitFile({ type: 'chunk', id: resolved.id, name: 'handlers' });
				}
			}

			if (!importer || !source.startsWith('.')) {
				return null;
			}

			const decoded = decode(stripQuery(importer));
			let from = stripQuery(importer);
			if (decoded) {
				from = decoded.path;
			}

			const id = encode(currentEnvironment, resolve(dirname(from), source));
			if (segments.has(id)) {
				return id;
			}

			if (!decoded) {
				return null;
			}

			let parent = decoded.path;
			const segment = segments.get(encode(decoded.environment, decoded.path));
			if (segment?.segment?.origin) {
				parent = segment.segment.origin;
			}

			return this.resolve(source, parent, { skipSelf: true });
		},
		load(id) {
			if (id === QWIK_BUILD) {
				const server = isServer(getEnvironment(this));
				return `export const isServer=${server};export const isBrowser=${!server};export const isDev=false;`;
			}

			const segment = segments.get(stripQuery(id));
			if (!segment) {
				return null;
			}

			return segment.code;
		},
		async transform(code, id) {
			const currentEnvironment = getEnvironment(this);
			let transformed = null;
			if (SOURCE_RE.test(stripQuery(id))) {
				transformed = await transform(
					code,
					id,
					this.emitFile.bind(this),
					currentEnvironment,
				);
			}

			if (!isServer(currentEnvironment)) {
				return transformed;
			}

			let next = code;
			let map = null;
			if (transformed) {
				next = transformed.code;
				map = transformed.map;
			}

			if (!next.includes(QWIK_MANIFEST)) {
				return transformed;
			}

			return { code: injectManifest(next, manifest), map };
		},
		async generateBundle(_, bundle) {
			if (!isClient(getEnvironment(this))) {
				return;
			}

			const currentRoot = getRoot();
			manifest = createManifest(bundle, symbols, currentRoot);
			if (currentRoot) {
				manifests.set(currentRoot, manifest);
			}

			this.emitFile({
				type: 'asset',
				fileName: Q_MANIFEST,
				source: JSON.stringify(manifest, null, '\t'),
			});
		},
	};

	async function transform(
		code: string,
		id: string,
		emitFile: EmitFile,
		currentEnvironment: QwikEnvironment,
	) {
		const result = await (
			await getOptimizer()
		).transformModules({
			input: [{ code, path: stripQuery(id) }],
			entryStrategy: entryStrategy(currentEnvironment, options.entryStrategy),
			minify: 'simplify',
			transpileTs: true,
			transpileJsx: true,
			explicitExtensions: true,
			preserveFilenames: true,
			srcDir: getRoot() ?? '',
			rootDir: getRoot(),
			mode: optimizerMode(currentEnvironment),
			isServer: isServer(currentEnvironment),
		});

		for (const module of result.modules) {
			if (!module.segment) {
				continue;
			}

			const id = encode(currentEnvironment, module.path);
			segments.set(id, module);
			if (isClient(currentEnvironment)) {
				symbols.set(module.segment.name, module.segment);
				emitFile({ type: 'chunk', id });
			}
		}

		const primary = result.modules.find((module) => !module.isEntry && !module.segment);
		if (primary) {
			return { code: primary.code, map: primary.map };
		}

		const fallback = result.modules[0];
		if (!fallback) {
			return null;
		}

		return { code: fallback.code, map: fallback.map };
	}
}

function isServer(environment: QwikEnvironment) {
	return environment === 'server';
}

function isClient(environment: QwikEnvironment) {
	return environment === 'client';
}

export function outputDefaults(output: OutputOptions, environment: QwikEnvironment): OutputOptions {
	if (environment === 'lib') {
		return output;
	}

	const next: OutputOptions = { ...output, hoistTransitiveImports: false };
	if (environment === 'server') {
		next.chunkFileNames ??= 'q-[hash].js';
		return next;
	}

	next.entryFileNames ??= join('build', 'q-[hash].js');
	next.chunkFileNames ??= join('build', 'q-[hash].js');
	return next;
}

function defineQwik(input: InputOptions) {
	const define = ((input.transform ??= {}).define ??= {});
	define['globalThis.qDev'] ??= 'false';
	define['import.meta.env.BASE_URL'] ??= '"/"';
	define['import.meta.env.DEV'] ??= 'false';
	define['import.meta.env.MODE'] ??= '"production"';
	define['import.meta.env.TEST'] ??= 'false';
	return input;
}

function entryStrategy(environment: QwikEnvironment, value: EntryStrategy | undefined) {
	if (environment === 'server') {
		return { type: 'hoist' } satisfies EntryStrategy;
	}

	if (environment === 'lib') {
		return { type: 'inline' } satisfies EntryStrategy;
	}

	if (value) {
		return value;
	}

	return { type: 'smart' } satisfies EntryStrategy;
}

function optimizerMode(environment: QwikEnvironment) {
	if (environment === 'lib') {
		return 'lib';
	}

	return 'prod';
}

function encode(environment: QwikEnvironment, path: string) {
	return `${SEGMENT}${environment}:${path}`;
}

function decode(id: string) {
	if (!id.startsWith(SEGMENT)) {
		return null;
	}

	const value = id.slice(SEGMENT.length);
	const index = value.indexOf(':');
	if (index < 0) {
		return null;
	}

	return { environment: value.slice(0, index) as QwikEnvironment, path: value.slice(index + 1) };
}

function stripQuery(id: string) {
	const index = id.search(/[?#]/);
	if (index < 0) {
		return id;
	}

	return id.slice(0, index);
}
