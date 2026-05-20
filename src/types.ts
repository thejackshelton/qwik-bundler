import type { EntryStrategy, OptimizerOptions, SegmentAnalysis } from '@qwik.dev/optimizer';

/** Build target that controls optimizer and output behavior. */
export type QwikEnvironment = 'client' | 'server' | 'lib';

/** Narrow Vite dev-server surface used for dev QRL segment loading. */
export interface QwikDevServer {
	/** Transform a parent module in the requested Qwik environment. */
	transformRequest: (url: string, environment: QwikEnvironment) => Promise<unknown> | unknown;
}

/** Shared options accepted by the Rolldown plugin and Vite adapter. */
export interface QwikRolldownOptions {
	/** Enable development-mode QRL segment behavior. */
	dev?: boolean;
	/** Dev server callbacks used to transform parent modules on demand. */
	devServer?: QwikDevServer;
	/** Optimizer entry strategy for grouping generated QRL segments. */
	entryStrategy?: EntryStrategy;
	/** Qwik experimental feature flags converted to compile-time defines. */
	experimental?: string[];
	/** Enable Vite HMR support in dev mode; set false to opt out. */
	hmr?: boolean;
	/** Extension hooks for router, insights, or app adapters to add their own preload graph nodes. */
	bundleGraphAdders?: Set<BundleGraphAdder>;
	/** Existing client manifest to inject when building a server bundle. */
	manifestInput?: QwikManifest | ServerQwikManifest;
	/** Called after the client manifest is created. */
	onManifest?: (manifest: QwikManifest) => void;
	/** Options forwarded directly to the Qwik optimizer. */
	optimizerOptions?: OptimizerOptions;
	/** Project root used for stable manifest origins and client/server manifest sharing. */
	rootDir?: string;
}

/** Production manifest consumed by Qwik SSR, preload code, and static HTML helpers. */
export interface QwikManifest {
	/** Stable hash of the final manifest payload. */
	manifestHash: string;
	/** Metadata for each known QRL symbol. */
	symbols: Record<string, QwikSymbol>;
	/** Symbol name to bundle filename lookup. */
	mapping: Record<string, string>;
	/** JavaScript bundle metadata keyed by emitted filename. */
	bundles: Record<string, QwikBundle>;
	/** Non-JavaScript assets keyed by emitted filename. */
	assets?: Record<string, QwikAsset>;
	/** Compact runtime preload graph. */
	bundleGraph?: QwikBundleGraph;
	/** Emitted asset filename for the serialized bundle graph. */
	bundleGraphAsset?: string;
	/** Emitted Qwik preloader bundle filename, when detected. */
	preloader?: string;
	/** Emitted Qwik core bundle filename, when detected. */
	core?: string;
	/** Emitted qwikloader bundle filename, when detected. */
	qwikLoader?: string;
	/** Global HTML tags requested by runtime integrations. */
	injections?: GlobalInjections[];
	/** Manifest schema version. */
	version: string;
}

/** Minimal manifest payload injected into server bundles. */
export type ServerQwikManifest = Pick<
	QwikManifest,
	| 'manifestHash'
	| 'injections'
	| 'bundleGraph'
	| 'bundleGraphAsset'
	| 'mapping'
	| 'preloader'
	| 'core'
	| 'qwikLoader'
>;

/** Optimizer-discovered QRL symbol metadata stored in the manifest. */
export type QwikSymbol = Partial<SegmentAnalysis> & {
	/** Source module that produced the symbol. */
	origin: string;
	/** Human-readable symbol name from the optimizer. */
	displayName: string;
	/** Stable symbol hash used by QRLs and bundle graph symbol nodes. */
	hash: string;
};

/** JavaScript bundle metadata used for manifest lookups and preload graph generation. */
export interface QwikBundle {
	/** Emitted bundle code size in bytes. */
	size: number;
	/** Size of this bundle plus all reachable static imports. */
	total: number;
	/** Preload priority signal derived from contained Qwik symbols. */
	interactivity?: number;
	/** QRL symbols emitted by this bundle. */
	symbols?: string[];
	/** Static bundle dependencies. */
	imports?: string[];
	/** Dynamic bundle dependencies considered for probabilistic preload. */
	dynamicImports?: string[];
	/** Source modules included in this bundle, relative to the project root when known. */
	origins?: string[];
}

/** Non-JavaScript asset metadata emitted alongside the manifest. */
export type QwikAsset = {
	/** Original asset name when provided by the bundler. */
	name: string | undefined;
	/** Emitted asset size in bytes. */
	size: number;
};

/** HTML tags that Qwik runtime integrations should inject globally. */
export type GlobalInjections = {
	/** HTML tag name to inject. */
	tag: string;
	/** HTML attributes for the injected tag. */
	attributes?: Record<string, string>;
	/** Document location for the injected tag. */
	location: 'head' | 'body';
};

/** Compact preload graph format consumed by Qwik's runtime preloader. */
export type QwikBundleGraph = Array<string | number>;

/** Extension point for apps/adapters to add route or framework-specific preload nodes. */
export type BundleGraphAdder = (
	manifest: QwikManifest,
) => Record<string, { imports?: string[]; dynamicImports?: string[] }> | undefined;
