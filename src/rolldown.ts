import {
	createOptimizer as createSwcOptimizer,
	type Diagnostic,
	type EntryStrategy,
	type SegmentAnalysis,
	type TransformModule,
	type TransformModuleInput,
	type TransformModulesOptions,
} from '@qwik.dev/optimizer';
import { dirname, join } from 'pathe';
import type { Plugin, RolldownError, TransformPluginContext } from 'rolldown';
import { isRelative, parsePath } from 'ufo';
import { outputDefaults, Q_BUNDLE_GRAPH, Q_BUILD_PREFIX, QWIK_BUILD } from './build/chunking.ts';
import { injectQwikPreloaderTags } from './build/static-html.ts';
import { createQwikDev } from './dev.ts';
import { comptimeConfig, replaceExperimental } from './features.ts';
import {
	applyOptimizerStripNames,
	fixPureAnnotations,
	makeConstPropsDiffable,
	mergeOptimizerStripNames,
} from './hmr/optimizer.ts';
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
	QwikOptimizerStripNames,
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
	QwikOptimizerStripNames,
	QwikRolldownOptions,
	QwikSymbol,
	ServerQwikManifest,
} from './types.ts';

type TransformContext = Pick<TransformPluginContext, 'emitFile' | 'error' | 'parse' | 'warn'>;
type Environment = QwikEnvironment | ((context: unknown) => QwikEnvironment);
type InternalQwikRolldownOptions = QwikRolldownOptions & {
	publicPath?: (fileName: string) => string;
};

const QWIK_HANDLERS = '@qwik.dev/core/handlers.mjs';
const QWIK_PRELOADER = '@qwik.dev/core/preloader';
// TODO: Remove once everyone is off @qwik-client-manifest.
const QWIK_CLIENT_MANIFEST = '@qwik-client-manifest';
const QWIK_HANDLERS_ENTRY = 'qwik:handlers';
const QWIK_PRELOADER_ENTRY = 'qwik:preloader';
const SEGMENT = '\0qwik:segment:';
const JS_OR_TS_SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const OPTIMIZER_SOURCE_FILE = /(?:\.[cm]?tsx?|\.jsx|\.mdx?)$/;
const QWIK_LIBRARY_SOURCE_FILE = /\.qwik\.[cm]?[jt]sx?$/;
const QWIK_RUNTIME_MODULE = /[/\\]@qwik\.dev[/\\]core[/\\]/;
const QWIK_CORE_PROD_MODULE = /[/\\]@qwik\.dev[/\\]core[/\\].*[/\\]core\.prod\.mjs$/;
const QWIK_PUBLIC_IMPORTS = ['@qwik.dev/core', '@builder.io/qwik'];
const QWIK_IMPORTS =
	/\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"](@qwik\.dev\/core(?:\/[^'"]*)?|@builder\.io\/qwik(?:\/[^'"]*)?)['"]/;
const manifests = new Map<string, QwikManifest>();

export const qwik = (options?: QwikRolldownOptions) => qwikClient(options);
export const qwikClient = (options: QwikRolldownOptions = {}) => plugin('client', options);
export const qwikServer = (options: QwikRolldownOptions = {}) => plugin('server', options);
export const qwikLib = (options: QwikRolldownOptions = {}) => plugin('lib', options);

export function plugin(environment: Environment, options: QwikRolldownOptions = {}): Plugin {
	const internalOptions = options as InternalQwikRolldownOptions;
	const segments = new Map<string, TransformModule>();
	const symbols = new Map<string, SegmentAnalysis>();
	const optimizerStripNames: QwikOptimizerStripNames = {};
	mergeOptimizerStripNames(optimizerStripNames, options.optimizerStripNames);
	// TODO: Remove this Qwik library noExternal workaround after https://github.com/QwikDev/qwik-evolution/discussions/318.
	const external = qwikExternal();
	let manifest: QwikManifest | ServerQwikManifest | null = null;
	let optimizer: ReturnType<typeof createSwcOptimizer> | undefined;
	let root = options.rootDir;
	let name = 'qwik:rolldown';

	if (typeof environment === 'string') {
		name = `qwik:rolldown:${environment}`;
	}

	function getOptimizer() {
		if (!optimizer) {
			if (options.optimizer === 'ts') {
				// Dynamic import — qwik-optimizer-ts isn't published yet, so it's
				// installed separately by consumers who opt in. The error message
				// surfaces the install instruction if the package is missing.
				// The TS optimizer's `createOptimizer` is structurally identical
				// to SWC's (same async signature, same `transformModules` shape);
				// the type assertion bridges the cross-package nominal divergence.
				optimizer = import('qwik-optimizer-ts').then(
					(mod) => mod.createOptimizer(options.optimizerOptions),
					(err) => {
						throw new Error(
							`createQwikPlugin({ optimizer: 'ts' }) requires \`qwik-optimizer-ts\` to be installed. ` +
								`Install it as a peer alongside qwik-bundler, then re-run the build.\n` +
								`Underlying error: ${err instanceof Error ? err.message : String(err)}`,
						);
					},
				) as ReturnType<typeof createSwcOptimizer>;
			} else {
				optimizer = createSwcOptimizer(options.optimizerOptions);
			}
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
			registerOptimizerStripNames: (names: QwikOptimizerStripNames) => {
				mergeOptimizerStripNames(optimizerStripNames, names);
			},
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
			if (source === QWIK_CLIENT_MANIFEST) {
				return QWIK_CLIENT_MANIFEST;
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

			if (!importer) {
				return null;
			}

			const importerPath = pathname(importer);
			const importerSegment = segments.get(importerPath);

			if (isRelative(source)) {
				const from = importerSegment?.path ?? importerPath;
				const id = segmentId(currentEnvironment, join(dirname(from), source));
				if (segments.has(id)) {
					return id;
				}
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
			if (id === QWIK_CLIENT_MANIFEST) {
				if (dev.isEnabled()) {
					return 'export const manifest = undefined;';
				}
				const currentManifest = getEnvironment(this) === 'server' ? manifest : null;
				return injectManifest(`export const manifest = ${QWIK_MANIFEST};`, currentManifest);
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
		async transform(code, id, meta) {
			const currentEnvironment = getEnvironment(this);
			const path = pathname(id);
			if (id.startsWith(SEGMENT) || segments.has(path)) {
				return null;
			}

			const fixed = QWIK_CORE_PROD_MODULE.test(path) ? fixPureAnnotations(code) : code;
			const replaced = replaceExperimental(fixed, currentEnvironment, options.experimental);
			const nextCode = replaced ?? fixed;
			const optimize = shouldOptimize(nextCode, path);
			// `meta.ast` is the host's pre-parsed AST. Threading it into the
			// optimizer eliminates a redundant parse when the TS optimizer is
			// selected. SWC ignores the field (it re-parses internally), so
			// passing it through is safe for both backends. Only forward when
			// the source wasn't rewritten upstream (replaceExperimental /
			// fixPureAnnotations would invalidate the AST positions).
			const astStable = replaced == null && fixed === code;
			const ast = astStable ? meta?.ast : undefined;
			const transformed = optimize
				? await transform(nextCode, path, this, currentEnvironment, ast)
				: null;
			const fallback =
				transformed ?? (replaced || fixed !== code ? { code: nextCode, map: null } : null);

			if (currentEnvironment !== 'server') {
				return fallback;
			}

			let next = nextCode;
			let map = null;
			if (transformed) {
				next = transformed.code;
				map = transformed.map;
			}

			if (!next.includes(QWIK_MANIFEST)) {
				return fallback;
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
					publicPath: internalOptions.publicPath,
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
	} as Plugin & {
		api: {
			invalidateDevSegments: typeof dev.invalidate;
			registerOptimizerStripNames: (names: QwikOptimizerStripNames) => void;
		};
	};

	async function transform(
		code: string,
		id: string,
		context: TransformContext,
		currentEnvironment: QwikEnvironment,
		ast?: unknown,
	) {
		// `ast` is the host's pre-parsed Program (`meta.ast` from Rolldown's
		// transform hook). Forwarded into `TransformModuleInput.program`; the
		// TS optimizer accepts it and skips its internal parse. SWC ignores
		// the field and re-parses internally, so the hand-off is a no-op for
		// the default backend.
		// `program` is an extension over SWC's `TransformModuleInput`; the cast
		// admits the optional field. SWC ignores it; the TS optimizer reads it.
		const input = (
			ast ? { ...dev.optimizerInput(code, id), program: ast } : dev.optimizerInput(code, id)
		) as TransformModuleInput;
		const transformOptions = {
			input: [input],
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
		} satisfies TransformModulesOptions;

		applyOptimizerStripNames(transformOptions, currentEnvironment, optimizerStripNames);

		const result = await (await getOptimizer()).transformModules(transformOptions);
		reportDiagnostics(result.diagnostics, id, context);

		for (const module of result.modules) {
			if (!module.segment && !module.isEntry) {
				continue;
			}

			const id = segmentId(currentEnvironment, module.path);
			segments.set(id, module);
			dev.recordSegment(module, currentEnvironment);
			if (currentEnvironment === 'client') {
				if (module.segment) {
					symbols.set(module.segment.name, module.segment);
				}
				if (!dev.isEnabled()) {
					context.emitFile({ type: 'chunk', id, preserveSignature: 'strict' });
				}
			}
		}

		const sourceModule = result.modules.find((module) => !module.isEntry && !module.segment);
		if (!sourceModule) {
			const firstModule = result.modules[0];
			if (!firstModule) {
				return null;
			}

			return { code: firstModule.code, map: firstModule.map };
		}

		const serverDevHmrOutput =
			currentEnvironment === 'server' &&
			dev.isEnabled() &&
			options.hmr !== false &&
			!QWIK_LIBRARY_SOURCE_FILE.test(id);
		if (!serverDevHmrOutput) {
			return { code: sourceModule.code, map: sourceModule.map };
		}

		// TODO: Move this into the optimizer when SSR HMR output and client
		// QRL segments emit the same diffable const-props shape. (attribute only HMR)
		return {
			code: makeConstPropsDiffable(sourceModule.code, context.parse),
			map: sourceModule.map,
		};
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

function shouldOptimize(code: string, path: string) {
	if (QWIK_RUNTIME_MODULE.test(path)) return false;
	if (QWIK_LIBRARY_SOURCE_FILE.test(path)) return true;
	if (OPTIMIZER_SOURCE_FILE.test(path)) return true;
	if (!JS_OR_TS_SOURCE_FILE.test(path)) return false;
	return importsQwik(code);
}

function importsQwik(code: string) {
	const match = QWIK_IMPORTS.exec(code);
	return !!match?.[1] && isQwikPublicImport(match[1]);
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
