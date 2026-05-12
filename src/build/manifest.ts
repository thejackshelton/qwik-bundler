import type { SegmentAnalysis } from '@qwik.dev/optimizer';
import { relative } from 'pathe';
import type { OutputBundle, OutputChunk } from 'rolldown';
import { convertManifestToBundleGraph, type QwikBundleGraph } from './bundle-graph';

export interface QwikManifest {
	manifestHash: string;
	symbols: Record<string, QwikSymbol>;
	mapping: Record<string, string>;
	bundles: Record<string, QwikBundle>;
	assets?: Record<string, QwikAsset>;
	bundleGraph?: QwikBundleGraph;
	bundleGraphAsset?: string;
	preloader?: string;
	core?: string;
	qwikLoader?: string;
	injections?: GlobalInjections[];
	version: string;
}

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

export type QwikSymbol = Partial<SegmentAnalysis> & {
	origin: string;
	displayName: string;
	hash: string;
};

export interface QwikBundle {
	size: number;
	total: number;
	symbols?: string[];
	imports?: string[];
	dynamicImports?: string[];
	origins?: string[];
}

export type QwikAsset = { name: string | undefined; size: number };

export type GlobalInjections = {
	tag: string;
	attributes?: Record<string, string>;
	location: 'head' | 'body';
};

export const QWIK_MANIFEST = 'globalThis.__QWIK_MANIFEST__';
export const Q_MANIFEST_FILE = 'q-manifest.json';

const HANDLERS = ['_chk', '_rsc', '_res', '_run', '_task', '_val', '_eaC', '_eaT', '_suC', '_suT'];
const HANDLER_SET = new Set(HANDLERS);
const PRELOADER_RE = /[/\\](core|qwik)[/\\]dist[/\\]preloader\.(|c|m)js$/;
const CORE_RE = /[/\\](core|qwik)[/\\]dist[/\\]core(\.min|\.prod)?\.(|c|m)js$/;
const QWIK_LOADER_RE = /[/\\](core|qwik)[/\\](dist[/\\])?qwikloader(\.debug)?\.[^/\\]*js$/;
const QWIK_LIBRARY_MODULE_RE = /\.qwik\.mjs$/;
const LIBRARY_QRL_SYMBOL_RE = /["']([A-Za-z_$][\w$.-]*_[A-Za-z0-9_-]{8,})["']/g;
const RUNTIME_BUNDLES = [
	['preloader', 'preloader', PRELOADER_RE],
	['core', 'core', CORE_RE],
	['qwikLoader', 'qwik-loader', QWIK_LOADER_RE],
] as const;

export function createManifest(
	bundle: OutputBundle,
	segments: Map<string, SegmentAnalysis>,
	root: string | undefined,
	options: {
		bundleGraphAsset?: string;
		canonPath?: (fileName: string) => string;
	} = {},
) {
	const canonPath = options.canonPath ?? ((fileName: string) => fileName);
	const manifest: QwikManifest = {
		version: '1',
		manifestHash: '',
		mapping: {},
		symbols: {},
		bundles: {},
		assets: {},
		injections: [],
	};

	for (const item of Object.values(bundle)) {
		if (item.type === 'asset') {
			if (item.fileName.endsWith('.js.map')) {
				continue;
			}

			manifest.assets![item.fileName] = {
				name: item.names[0] ?? item.name,
				size: item.source.length,
			};
			continue;
		}

		const bundleFileName = canonPath(item.fileName);
		const origins = getOrigins(item, root);
		const exportedNames = item.exports.filter((name) => segments.has(name));
		for (const name of exportedNames) {
			if (!manifest.mapping[name] || item.exports.length !== 1) {
				manifest.mapping[name] = bundleFileName;
			}
		}
		if (item.moduleIds.some((id) => QWIK_LIBRARY_MODULE_RE.test(id))) {
			for (const name of findLibraryQrlSymbols(item.code)) {
				if (!segments.has(name) && !manifest.mapping[name]) {
					manifest.mapping[name] = bundleFileName;
				}
			}
		}
		for (const name of item.exports.filter((name) => HANDLER_SET.has(name))) {
			manifest.mapping[name] = bundleFileName;
			manifest.symbols[name] = handlerSymbol(name);
		}

		const qwikBundle: QwikBundle = {
			size: item.code.length,
			total: item.code.length,
		};
		const imports = mapBundleNames(bundle, item.imports, canonPath);
		if (imports.length > 0) {
			qwikBundle.imports = imports;
		}
		const dynamicImports = mapBundleNames(bundle, item.dynamicImports, canonPath);
		if (dynamicImports.length > 0) {
			qwikBundle.dynamicImports = dynamicImports;
		}

		if (origins.length > 0) {
			qwikBundle.origins = origins;
		}

		detectQwikCoreBundles(manifest, item, origins, bundleFileName);

		manifest.bundles[bundleFileName] = qwikBundle;
	}

	for (const [symbolName, segment] of segments) {
		const bundleFileName = manifest.mapping[symbolName];
		if (!bundleFileName) {
			continue;
		}
		const qwikBundle = manifest.bundles[bundleFileName];
		if (!qwikBundle) {
			continue;
		}

		const symbols = (qwikBundle.symbols ??= []);
		symbols.push(symbolName);
		manifest.symbols[symbolName] = segment;
	}

	if (manifest.core) {
		for (const symbol of HANDLERS) {
			manifest.mapping[symbol] ??= manifest.core;
			manifest.symbols[symbol] ??= handlerSymbol(symbol);
		}
	}
	filterRuntimeImports(manifest);
	sortManifest(manifest);

	if (options.bundleGraphAsset) {
		manifest.bundleGraph = convertManifestToBundleGraph(manifest);
		manifest.bundleGraphAsset = options.bundleGraphAsset;
		manifest.assets![options.bundleGraphAsset] = {
			name: 'bundle-graph.json',
			size: JSON.stringify(manifest.bundleGraph).length,
		};
	}

	manifest.manifestHash = '';
	manifest.manifestHash = hash(JSON.stringify(manifest));
	return manifest;
}

function findLibraryQrlSymbols(code: string) {
	const symbols = new Set<string>();
	for (const match of code.matchAll(LIBRARY_QRL_SYMBOL_RE)) {
		const symbol = match[1];
		if (symbol) {
			symbols.add(symbol);
		}
	}
	return symbols;
}

function handlerSymbol(symbol: string): QwikSymbol {
	return { origin: 'Qwik core', displayName: symbol, hash: symbol };
}

export function injectManifest(code: string, manifest: QwikManifest | ServerQwikManifest | null) {
	let value = QWIK_MANIFEST;
	if (manifest?.manifestHash) {
		value = JSON.stringify({
			manifestHash: manifest.manifestHash,
			mapping: manifest.mapping,
			injections: manifest.injections,
			bundleGraph: manifest.bundleGraph,
			bundleGraphAsset: manifest.bundleGraphAsset,
			core: manifest.core,
			preloader: manifest.preloader,
			qwikLoader: manifest.qwikLoader,
		});
	}

	return code.replaceAll(`!${QWIK_MANIFEST}`, 'false').replaceAll(QWIK_MANIFEST, value);
}

function mapBundleNames(
	bundle: OutputBundle,
	names: string[],
	canonPath: (fileName: string) => string,
) {
	return names.flatMap((name) => {
		const item = bundle[name];
		return item ? [canonPath(item.fileName)] : [];
	});
}

function getOrigins(item: OutputChunk, root: string | undefined) {
	return item.moduleIds
		.filter((id) => !id.startsWith('\0'))
		.map((id) => (root ? relative(root, id) : id))
		.sort();
}

function detectQwikCoreBundles(
	manifest: QwikManifest,
	item: OutputChunk,
	origins: string[],
	bundleFileName: string,
) {
	const candidates = [item.name, item.facadeModuleId ?? '', ...item.moduleIds, ...origins];
	for (const [field, name, pattern] of RUNTIME_BUNDLES) {
		if (!manifest[field] && candidates.some((value) => value === name || pattern.test(value))) {
			manifest[field] = bundleFileName;
		}
	}
}

function filterRuntimeImports(manifest: QwikManifest) {
	const ignored = new Set(
		[manifest.core, manifest.preloader].filter((name): name is string => !!name),
	);
	if (ignored.size === 0) {
		return;
	}

	for (const bundle of Object.values(manifest.bundles)) {
		if (!bundle.imports) {
			continue;
		}

		bundle.imports = bundle.imports.filter((name) => !ignored.has(name));
		if (bundle.imports.length === 0) {
			delete bundle.imports;
		}
	}
}

function sortManifest(manifest: QwikManifest) {
	manifest.mapping = sortRecord(manifest.mapping);
	manifest.symbols = sortRecord(manifest.symbols);
	manifest.bundles = sortRecord(manifest.bundles);
	manifest.assets = sortRecord(manifest.assets ?? {});
	for (const bundle of Object.values(manifest.bundles)) {
		bundle.imports?.sort();
		bundle.dynamicImports?.sort();
		bundle.origins?.sort();
		bundle.symbols?.sort();
	}
}

function sortRecord<T>(record: Record<string, T>) {
	const next: Record<string, T> = {};
	for (const key of Object.keys(record).sort()) {
		const value = record[key];
		if (value !== undefined) {
			next[key] = value;
		}
	}
	return next;
}

function hash(value: string) {
	let next = 5381;
	for (let i = 0; i < value.length; i++) {
		next = (next * 33) ^ value.charCodeAt(i);
	}

	return (next >>> 0).toString(36);
}
