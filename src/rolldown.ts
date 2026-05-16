import {
	createOptimizer,
	type Diagnostic,
	type EntryStrategy,
	type SegmentAnalysis,
	type TransformModule,
} from '@qwik.dev/optimizer';
import { dirname, resolve } from 'pathe';
import type { Plugin, RolldownError, TransformPluginContext } from 'rolldown';
import { isRelative, parsePath } from 'ufo';
import { outputDefaults, Q_BUNDLE_GRAPH, Q_BUILD_PREFIX, QWIK_BUILD } from './build/chunking.ts';
import { injectQwikPreloaderTags } from './build/static-html.ts';
import { createQwikDev } from './dev.ts';
import { comptimeConfig, replaceExperimental } from './features.ts';
import {
	createManifest,
	injectManifest,
	Q_MANIFEST_FILE,
	QWIK_MANIFEST,
} from './build/manifest.ts';
import { qwikExternal } from './qwik-external.ts';
import type {
	QwikEnvironment,
	QwikManifest,
	QwikRolldownOptions,
	ServerQwikManifest,
} from './types.ts';

export type {
	BundleGraphAdder,
	GlobalInjections,
	QwikAsset,
	QwikBundle,
	QwikBundleGraph,
	QwikDevServer,
	QwikEnvironment,
	QwikManifest,
	QwikRolldownOptions,
	QwikSymbol,
	ServerQwikManifest,
} from './types.ts';

type TransformContext = Pick<TransformPluginContext, 'emitFile' | 'error' | 'warn'>;
type Environment = QwikEnvironment | ((context: unknown) => QwikEnvironment);
type ParseAst = TransformPluginContext['parse'];
type ImportLikeNode = { type?: string; source?: { value?: unknown } };

const QWIK_HANDLERS = '@qwik.dev/core/handlers.mjs';
const QWIK_PRELOADER = '@qwik.dev/core/preloader';
const QWIK_HANDLERS_ENTRY = 'qwik:handlers';
const QWIK_PRELOADER_ENTRY = 'qwik:preloader';
const SEGMENT = '\0qwik:segment:';
const JS_OR_TS_SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const QWIK_LIBRARY_SOURCE_FILE = /\.qwik\.[cm]?[jt]sx?$/;
const QWIK_RUNTIME_MODULE = /[/\\]@qwik\.dev[/\\]core[/\\]/;
const QWIK_PUBLIC_IMPORTS = ['@qwik.dev/core', '@builder.io/qwik'];
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
			const next = comptimeConfig(input, options.experimental, options.dev);
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

			missingManifestWarned = false;
			if (!dev.isEnabled() && getEnvironment(this) === 'client') {
				for (const [id, name] of [
					[QWIK_HANDLERS_ENTRY, 'handlers'],
					[QWIK_PRELOADER_ENTRY, 'preloader'],
				] as const) {
					this.emitFile({
						type: 'chunk',
						id,
						name,
						preserveSignature: 'allow-extension',
					});
				}
			}

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
			if (source === QWIK_HANDLERS_ENTRY || source === QWIK_PRELOADER_ENTRY) {
				return source;
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
			if (id === QWIK_HANDLERS_ENTRY) {
				return `export { _chk, _rsc, _res, _run, _task, _val, _eaC, _eaT, _suC, _suT } from '${QWIK_HANDLERS}';`;
			}
			if (id === QWIK_PRELOADER_ENTRY) {
				return `export { g, l, p } from '${QWIK_PRELOADER}';`;
			}

			const devCode = await dev.load(id, this.parse);
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
			const optimize = shouldOptimize(replaced ?? code, path, this.parse);
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
					bundleGraphAdders: options.bundleGraphAdders,
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
			mode:
				currentEnvironment === 'lib'
					? 'lib'
					: dev.isEnabled() && options.hmr !== false
						? 'hmr'
						: dev.isEnabled()
							? 'dev'
							: 'prod',
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
					context.emitFile({ type: 'chunk', id, preserveSignature: 'strict' });
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

function shouldOptimize(code: string, path: string, parse: ParseAst) {
	if (!JS_OR_TS_SOURCE_FILE.test(path)) return false;
	if (QWIK_RUNTIME_MODULE.test(path)) return false;
	if (QWIK_LIBRARY_SOURCE_FILE.test(path)) return true;
	return importsQwik(code, parse);
}

function importsQwik(code: string, parse: ParseAst) {
	let ast: { body?: ImportLikeNode[] };
	try {
		ast = parse(code) as { body?: ImportLikeNode[] };
	} catch {
		return false;
	}

	for (const node of ast.body ?? []) {
		if (!isImportNode(node.type)) continue;

		const source = node.source?.value;
		if (typeof source === 'string' && isQwikPublicImport(source)) {
			return true;
		}
	}
	return false;
}

function isImportNode(type: string | undefined) {
	return (
		type === 'ImportDeclaration' ||
		type === 'ExportNamedDeclaration' ||
		type === 'ExportAllDeclaration'
	);
}

function isQwikPublicImport(source: string) {
	return QWIK_PUBLIC_IMPORTS.some((id) => source === id || source.startsWith(`${id}/`));
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
