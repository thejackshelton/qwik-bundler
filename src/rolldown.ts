import {
	createOptimizer,
	type EntryStrategy,
	type OptimizerOptions,
	type SegmentAnalysis,
	type TransformModule,
} from '@qwik.dev/optimizer';
import { dirname, join, relative, resolve } from 'pathe';
import type { CodeSplittingOptions, InputOptions, OutputOptions, Plugin } from 'rolldown';
import {
	createManifest,
	injectManifest,
	QWIK_MANIFEST,
	type QwikManifest,
	type ServerQwikManifest,
} from './q-manifest';
import { qwikExternal } from './qwik-external';

export type QwikEnvironment = 'client' | 'server' | 'lib';

export interface QwikRolldownOptions {
	entryStrategy?: EntryStrategy;
	experimental?: string[];
	manifestInput?: QwikManifest | ServerQwikManifest;
	onManifest?: (manifest: QwikManifest) => void;
	optimizerOptions?: OptimizerOptions;
	rootDir?: string;
}

type EmitFile = (file: { type: 'chunk'; id: string }) => string;
type Environment = QwikEnvironment | ((context: unknown) => QwikEnvironment);

const QWIK_BUILD = '@qwik.dev/core/build';
const QWIK_CORE = '@qwik.dev/core';
const QWIK_HANDLERS = '@qwik.dev/core/handlers.mjs';
const QWIK_PRELOADER = '@qwik.dev/core/preloader';
const VITE_PRELOAD_HELPER = '\0vite/preload-helper.js';
const Q_BUILD_DIR = 'build';
const Q_BUNDLE_GRAPH = join(Q_BUILD_DIR, 'bundle-graph.json');
const Q_MANIFEST = 'q-manifest.json';
const SEGMENT = '\0qwik:segment:';
const SOURCE_RE = /(?:\.[jt]sx?|\.qwik\.[mj]s)$/;
const QWIK_CORE_GROUP_RE = /[/\\](core|qwik)[/\\](handlers|dist[/\\]core(\.prod|\.min)?)\.mjs$/;
const QWIK_PRELOADER_GROUP_RE = /[/\\](core|qwik)[/\\]dist[/\\]preloader\.mjs$/;
const QWIK_LOADER_GROUP_RE = /[/\\](core|qwik)[/\\]dist[/\\]qwikloader\.js$/;
const QWIK_CODE_SPLITTING_GROUPS = [
	{
		name: 'qwik-core',
		test: QWIK_CORE_GROUP_RE,
	},
	{
		name: 'qwik-loader',
		test: QWIK_LOADER_GROUP_RE,
	},
	{
		name: 'qwik-preloader',
		test: (id: string) =>
			id.endsWith(QWIK_BUILD) ||
			id === VITE_PRELOAD_HELPER ||
			QWIK_PRELOADER_GROUP_RE.test(id),
	},
] satisfies NonNullable<CodeSplittingOptions['groups']>;
const EXPERIMENTAL_FEATURES =
	'each suspense preventNavigate valibot noSPA enableRequestRewrite webWorker insights'.split(
		' ',
	);
const manifests = new Map<string, QwikManifest>();

export const qwik = (options?: QwikRolldownOptions) => qwikClient(options);
export const qwikClient = (options: QwikRolldownOptions = {}) => plugin('client', options);
export const qwikServer = (options: QwikRolldownOptions = {}) => plugin('server', options);
export const qwikLib = (options: QwikRolldownOptions = {}) => plugin('lib', options);

export function plugin(environment: Environment, options: QwikRolldownOptions = {}): Plugin {
	const segments = new Map<string, TransformModule>();
	const symbols = new Map<string, SegmentAnalysis>();
	// TODO: Remove this Qwik library noExternal workaround after https://github.com/QwikDev/qwik-evolution/discussions/318.
	const external = qwikExternal();
	let manifest: QwikManifest | ServerQwikManifest | null = null;
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
			const next = defineQwik(input, options.experimental);
			const currentEnvironment = getEnvironment(this);
			if (isClient(currentEnvironment)) {
				next.preserveEntrySignatures ??= 'allow-extension';
			}

			external.options(this, next, currentEnvironment);
			return next;
		},
		async buildStart(input) {
			if (!root) {
				root = options.rootDir ?? input.cwd;
			}

			handlers = false;
			if (options.manifestInput) {
				manifest = options.manifestInput;
				return;
			}

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

			const externalResolution = await external.resolve(
				this,
				currentEnvironment,
				source,
				importer,
			);
			if (externalResolution) {
				return externalResolution;
			}

			if (isClient(currentEnvironment) && source === QWIK_CORE && !handlers) {
				handlers = true;
				const entries = [
					[QWIK_HANDLERS, 'handlers'],
					[QWIK_PRELOADER, 'preloader'],
				] as const;
				for (const [id, name] of entries) {
					const resolved = await this.resolve(id, importer, { skipSelf: true });
					if (resolved) {
						this.emitFile({ type: 'chunk', id: resolved.id, name });
					}
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
			const clientManifest = createManifest(bundle, symbols, currentRoot, {
				bundleGraphAsset: Q_BUNDLE_GRAPH,
				canonPath: (fileName) => canonicalBundlePath(fileName, Q_BUILD_DIR),
			});
			manifest = clientManifest;
			if (currentRoot) {
				manifests.set(currentRoot, clientManifest);
			}
			options.onManifest?.(clientManifest);

			this.emitFile({
				type: 'asset',
				fileName: Q_BUNDLE_GRAPH,
				source: JSON.stringify(clientManifest.bundleGraph),
			});

			this.emitFile({
				type: 'asset',
				fileName: Q_MANIFEST,
				source: JSON.stringify(clientManifest, null, '\t'),
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

	next.entryFileNames ??= join(Q_BUILD_DIR, 'q-[hash].js');
	next.chunkFileNames ??= join(Q_BUILD_DIR, 'q-[hash].js');
	next.codeSplitting = qwikCodeSplitting(next.codeSplitting);
	return next;
}

function qwikCodeSplitting(codeSplitting: OutputOptions['codeSplitting']) {
	if (typeof codeSplitting === 'boolean') {
		throw new Error(
			'Qwik requires output.codeSplitting to be an object so runtime chunks can be grouped.',
		);
	}

	return {
		...codeSplitting,
		includeDependenciesRecursively: false,
		groups: [...QWIK_CODE_SPLITTING_GROUPS, ...(codeSplitting?.groups ?? [])],
	} satisfies CodeSplittingOptions;
}

function canonicalBundlePath(fileName: string, buildDir: string) {
	const path = relative(buildDir, fileName);
	if (!path || path === '..' || path.startsWith('../')) {
		return fileName;
	}

	return path;
}

function defineQwik(input: InputOptions, experimental: string[] = []) {
	const define = ((input.transform ??= {}).define ??= {});
	define['globalThis.qDev'] ??= 'false';
	define['import.meta.env.BASE_URL'] ??= '"/"';
	define['import.meta.env.DEV'] ??= 'false';
	define['import.meta.env.MODE'] ??= '"production"';
	define['import.meta.env.TEST'] ??= 'false';
	for (const feature of EXPERIMENTAL_FEATURES) {
		define[`__EXPERIMENTAL__.${feature}`] ??= String(experimental.includes(feature));
	}
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

	return {
		environment: value.slice(0, index) as QwikEnvironment,
		path: value.slice(index + 1),
	};
}

function stripQuery(id: string) {
	const index = id.search(/[?#]/);
	if (index < 0) {
		return id;
	}

	return id.slice(0, index);
}
