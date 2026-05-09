import {
	createOptimizer,
	type Diagnostic,
	type EntryStrategy,
	type OptimizerOptions,
	type SegmentAnalysis,
	type TransformModule,
} from '@qwik.dev/optimizer';
import { dirname, normalize, resolve } from 'pathe';
import type { Plugin, RolldownError } from 'rolldown';
import { isRelative, parsePath } from 'ufo';
import { outputDefaults, Q_BUNDLE_GRAPH, Q_BUILD_PREFIX, QWIK_BUILD } from './build/chunking';
import { injectQwikPreloaderTags } from './build/static-html';
import { createQwikDev, type QwikDevServer } from './dev';
import { defineQwik, replaceExperimental } from './features';
import {
	createManifest,
	injectManifest,
	Q_MANIFEST_FILE,
	QWIK_MANIFEST,
	type QwikManifest,
	type ServerQwikManifest,
} from './build/manifest';
import { qwikExternal } from './qwik-external';

export type QwikEnvironment = 'client' | 'server' | 'lib';

export interface QwikRolldownOptions {
	dev?: boolean;
	devServer?: QwikDevServer;
	entryStrategy?: EntryStrategy;
	experimental?: string[];
	hmr?: boolean;
	manifestInput?: QwikManifest | ServerQwikManifest;
	onManifest?: (manifest: QwikManifest) => void;
	optimizerOptions?: OptimizerOptions;
	rootDir?: string;
}

type EmitFile = (file: { type: 'chunk'; id: string }) => string;
type TransformContext = {
	emitFile: EmitFile;
	error: (error: RolldownError) => never;
	warn: (warning: RolldownError) => void;
};
type Environment = QwikEnvironment | ((context: unknown) => QwikEnvironment);

const QWIK_CORE = '@qwik.dev/core';
const QWIK_HANDLERS = '@qwik.dev/core/handlers.mjs';
const QWIK_PRELOADER = '@qwik.dev/core/preloader';
const SEGMENT = '\0qwik:segment:';
const JS_OR_TS_SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const QWIK_LIBRARY_SOURCE_FILE = /\.qwik\.[cm]?[jt]sx?$/;
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
	let missingManifestWarned = false;
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
	const dev = createQwikDev(options, segments, getRoot, segmentId);

	return {
		api: {
			invalidateDevSegments: dev.invalidate,
		},
		name,
		options(input) {
			const next = defineQwik(input, options.experimental, options.dev);
			const currentEnvironment = getEnvironment(this);
			if (currentEnvironment === 'client') {
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
			missingManifestWarned = false;
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
			const devResolution = dev.resolveId(
				source,
				currentEnvironment,
				sourceImporter(importer),
			);
			if (devResolution) return devResolution;

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

			if (
				!dev.isEnabled() &&
				currentEnvironment === 'client' &&
				source === QWIK_CORE &&
				!handlers
			) {
				handlers = true;
				const entries = [
					[QWIK_HANDLERS, 'handlers'],
					[QWIK_PRELOADER, 'preloader'],
				] as const;
				for (const [id, name] of entries) {
					const resolved = await this.resolve(id, importer, { skipSelf: true });
					if (!resolved) {
						this.error(
							createPluginError(importer ?? source, `Failed to resolve ${id}`),
						);
					}

					this.emitFile({
						type: 'chunk',
						id: resolved.id,
						name,
						preserveSignature: 'allow-extension',
					});
				}
			}

			if (!importer || !isRelative(source)) {
				return null;
			}

			const importerPath = pathname(importer);
			const importerSegment = segments.get(importerPath);
			const from = importerSegment?.path ?? importerPath;

			const id = segmentId(currentEnvironment, resolve(dirname(from), source));
			if (segments.has(id)) {
				return id;
			}

			if (!importerSegment) {
				return null;
			}

			const parent = importerSegment.segment?.origin ?? importerSegment.path;

			return this.resolve(source, parent, { skipSelf: true });
		},
		async load(id) {
			if (id === QWIK_BUILD) {
				const server = getEnvironment(this) === 'server';
				const isDev = dev.isEnabled();
				return `globalThis.qDev=${isDev};export const isServer=${server};export const isBrowser=${!server};export const isDev=${isDev};`;
			}

			const devCode = await dev.load(id);
			if (devCode !== undefined) return devCode;

			const segment = segments.get(pathname(id));
			if (!segment) {
				return null;
			}

			return segment.code;
		},
		async transform(code, id) {
			const currentEnvironment = getEnvironment(this);
			const path = pathname(id);
			const replaced = replaceExperimental(code, currentEnvironment, options.experimental);
			const optimize =
				JS_OR_TS_SOURCE_FILE.test(path) &&
				(!normalize(path).includes('/node_modules/') ||
					QWIK_LIBRARY_SOURCE_FILE.test(path));
			const transformed = optimize
				? await transform(replaced ?? code, path, this, currentEnvironment)
				: null;
			const fallback = transformed ?? (replaced ? { code: replaced, map: null } : null);

			if (currentEnvironment !== 'server') {
				return fallback;
			}

			let next = replaced ?? code;
			let map = null;
			if (transformed) {
				next = transformed.code;
				map = transformed.map;
			}

			if (!next.includes(QWIK_MANIFEST)) {
				return fallback;
			}
			if (!dev.isEnabled() && !manifest?.manifestHash && !missingManifestWarned) {
				missingManifestWarned = true;
				this.warn(
					createPluginError(
						path,
						'Qwik server manifest was referenced, but no client manifest is available. Pass manifestInput or run the client build before the server build.',
					),
				);
			}

			return { code: injectManifest(next, manifest), map };
		},
		generateBundle: {
			order: 'post',
			handler(_, bundle) {
				if (getEnvironment(this) !== 'client') return;

				const clientManifest = createManifest(bundle, symbols, getRoot(), {
					bundleGraphAsset: Q_BUNDLE_GRAPH,
					canonPath: stripBuildPrefix,
				});
				manifest = clientManifest;
				const currentRoot = getRoot();
				if (currentRoot) {
					manifests.set(currentRoot, clientManifest);
				}
				options.onManifest?.(clientManifest);
				injectQwikPreloaderTags(bundle, clientManifest);

				for (const [fileName, source] of [
					[Q_BUNDLE_GRAPH, JSON.stringify(clientManifest.bundleGraph)],
					[Q_MANIFEST_FILE, JSON.stringify(clientManifest, null, '\t')],
				] as const) {
					this.emitFile({ type: 'asset', fileName, source });
				}
			},
		},
	} as Plugin & { api: { invalidateDevSegments: typeof dev.invalidate } };

	async function transform(
		code: string,
		id: string,
		context: TransformContext,
		currentEnvironment: QwikEnvironment,
	) {
		const result = await (
			await getOptimizer()
		).transformModules({
			input: [dev.optimizerInput(code, id)],
			entryStrategy: entryStrategy(currentEnvironment, options.entryStrategy),
			minify: 'simplify',
			sourceMaps: dev.isEnabled(),
			transpileTs: true,
			transpileJsx: true,
			explicitExtensions: true,
			preserveFilenames: true,
			srcDir: getRoot() ?? '',
			rootDir: getRoot(),
			mode: currentEnvironment === 'lib' ? 'lib' : dev.isEnabled() ? 'dev' : 'prod',
			isServer: currentEnvironment === 'server',
		});
		reportDiagnostics(result.diagnostics, id, context);

		for (const module of result.modules) {
			if (!module.segment) {
				continue;
			}

			const id = segmentId(currentEnvironment, module.path);
			segments.set(id, module);
			dev.recordSegment(module, currentEnvironment);
			if (currentEnvironment === 'client') {
				symbols.set(module.segment.name, module.segment);
				if (!dev.isEnabled()) {
					context.emitFile({ type: 'chunk', id });
				}
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

function stripBuildPrefix(fileName: string) {
	return fileName.startsWith(Q_BUILD_PREFIX) ? fileName.slice(Q_BUILD_PREFIX.length) : fileName;
}

function reportDiagnostics(diagnostics: Diagnostic[], id: string, context: TransformContext) {
	for (const diagnostic of diagnostics) {
		const loc = diagnostic.highlights?.[0];
		const error = Object.assign(createPluginError(id, diagnostic.message), {
			loc: loc && {
				column: loc.startCol,
				line: loc.startLine,
			},
		});
		if (diagnostic.category === 'error') {
			context.error(error);
		} else {
			context.warn(error);
		}
	}
}

function createPluginError(id: string, message: string): RolldownError {
	return Object.assign(new Error(message), {
		id,
		plugin: 'qwik',
		stack: '',
	});
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

function segmentId(environment: QwikEnvironment, path: string) {
	return `${SEGMENT}${environment}:${path}`;
}

function sourceImporter(id: string | undefined) {
	if (!id?.startsWith(SEGMENT)) {
		return id;
	}

	const index = id.indexOf(':', SEGMENT.length);
	return index < 0 ? id : id.slice(index + 1);
}

function pathname(id: string) {
	return parsePath(id).pathname;
}
