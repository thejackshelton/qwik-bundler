import type { SegmentAnalysis } from '@qwik.dev/optimizer';
import { relative } from 'pathe';
import type { OutputBundle, OutputChunk } from 'rolldown';

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

export type QwikBundleGraph = Array<string | number>;

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

const HANDLERS = ['_chk', '_rsc', '_res', '_run', '_task', '_val', '_eaC', '_eaT', '_suC', '_suT'];
const PRELOADER_RE = /[/\\](core|qwik)[/\\]dist[/\\]preloader\.(|c|m)js$/;
const CORE_RE = /[/\\](core|qwik)[/\\]dist[/\\]core(\.min|\.prod)?\.(|c|m)js$/;
const QWIK_LOADER_RE = /[/\\](core|qwik)[/\\](dist[/\\])?qwikloader(\.debug)?\.[^/\\]*js$/;
const QWIK_LIBRARY_MODULE_RE = /\.qwik\.mjs$/;
const LIBRARY_QRL_SYMBOL_RE = /["']([A-Za-z_$][\w$.-]*_[A-Za-z0-9_-]{8,})["']/g;

export function createManifest(
	bundle: OutputBundle,
	segments: Map<string, SegmentAnalysis>,
	root: string | undefined,
	options: { bundleGraphAsset?: string; canonPath?: (fileName: string) => string } = {},
) {
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
				size: assetSize(item.source),
			};
			continue;
		}

		const bundleFileName = bundleName(item.fileName, options);
		const origins = getOrigins(item, root);
		const exportedNames = item.exports.filter((name) => segments.has(name));
		for (const name of exportedNames) {
			if (!manifest.mapping[name] || item.exports.length !== 1) {
				manifest.mapping[name] = bundleFileName;
			}
		}
		if (hasQwikLibraryModule(item)) {
			for (const name of findLibraryQrlSymbols(item.code)) {
				if (!segments.has(name) && !manifest.mapping[name]) {
					manifest.mapping[name] = bundleFileName;
				}
			}
		}

		const qwikBundle: QwikBundle = {
			size: item.code.length,
			total: item.code.length,
		};
		const imports = mapBundleNames(bundle, item.imports, options);
		if (imports.length > 0) {
			qwikBundle.imports = imports;
		}
		const dynamicImports = mapBundleNames(bundle, item.dynamicImports, options);
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
			manifest.mapping[symbol] = manifest.core;
			manifest.symbols[symbol] = { origin: 'Qwik core', displayName: symbol, hash: symbol };
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

function hasQwikLibraryModule(item: OutputChunk) {
	return item.moduleIds.some((id) => QWIK_LIBRARY_MODULE_RE.test(id));
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

export function convertManifestToBundleGraph(manifest: QwikManifest): QwikBundleGraph {
	const graph: Record<string, QwikBundle> = { ...manifest.bundles };
	for (const [symbol, bundleName] of Object.entries(manifest.mapping)) {
		if (symbol.startsWith('_') && symbol.length < 10) {
			continue;
		}

		const symbolHash = getSymbolHash(symbol);
		if (symbolHash) {
			graph[symbolHash] = { size: 0, total: 0, dynamicImports: [bundleName] };
		}
	}

	for (const bundleName of Object.keys(graph)) {
		const qwikBundle = graph[bundleName];
		if (!qwikBundle) {
			continue;
		}

		const imports = qwikBundle.imports?.filter((dep) => graph[dep]) ?? [];
		const dynamicImports = qwikBundle.dynamicImports?.filter((dep) => graph[dep]) ?? [];

		graph[bundleName] = { ...qwikBundle, imports, dynamicImports };
	}

	const nodes = Object.keys(graph)
		.sort()
		.map((name) => graphNode(name, graph));
	const indexes = new Map<string, number>();
	let index = 0;
	for (const node of nodes) {
		indexes.set(node.name, index);
		index += 1 + node.deps.length;
	}

	const bundleGraph: QwikBundleGraph = [];
	for (const node of nodes) {
		bundleGraph.push(node.name);
		for (const dep of node.deps) {
			if (typeof dep === 'number') {
				bundleGraph.push(dep);
				continue;
			}

			const depIndex = indexes.get(dep);
			if (depIndex !== undefined) {
				bundleGraph.push(depIndex);
			}
		}
	}
	return bundleGraph;
}

function mapBundleNames(
	bundle: OutputBundle,
	names: string[],
	options: { canonPath?: (fileName: string) => string },
) {
	const mapped: string[] = [];
	for (const name of names) {
		const item = bundle[name];
		if (item) {
			mapped.push(bundleName(item.fileName, options));
		}
	}
	return mapped;
}

function bundleName(fileName: string, options: { canonPath?: (fileName: string) => string }) {
	return options.canonPath?.(fileName) ?? fileName;
}

function getOrigins(item: OutputChunk, root: string | undefined) {
	const origins: string[] = [];
	for (const id of item.moduleIds) {
		if (id.startsWith('\0')) {
			continue;
		}
		if (root) {
			origins.push(relative(root, id));
			continue;
		}
		origins.push(id);
	}
	return origins.sort();
}

function detectQwikCoreBundles(
	manifest: QwikManifest,
	item: OutputChunk,
	origins: string[],
	bundleFileName: string,
) {
	const candidates = [item.name, item.facadeModuleId ?? '', ...item.moduleIds, ...origins];
	if (
		!manifest.preloader &&
		candidates.some((value) => value === 'preloader' || PRELOADER_RE.test(value))
	) {
		manifest.preloader = bundleFileName;
	}
	if (!manifest.core && candidates.some((value) => value === 'core' || CORE_RE.test(value))) {
		manifest.core = bundleFileName;
	}
	if (
		!manifest.qwikLoader &&
		candidates.some((value) => value === 'qwik-loader' || QWIK_LOADER_RE.test(value))
	) {
		manifest.qwikLoader = bundleFileName;
	}
}

function filterRuntimeImports(manifest: QwikManifest) {
	const ignored = new Set<string>();
	if (manifest.core) {
		ignored.add(manifest.core);
	}
	if (manifest.preloader) {
		ignored.add(manifest.preloader);
	}
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

function assetSize(source: string | Uint8Array) {
	if (typeof source === 'string') {
		return source.length;
	}
	return source.byteLength;
}

function sortManifest(manifest: QwikManifest) {
	manifest.mapping = sortRecord(manifest.mapping);
	manifest.symbols = sortRecord(manifest.symbols);
	manifest.bundles = sortRecord(manifest.bundles);
	manifest.assets = sortRecord(manifest.assets ?? {});
	for (const name of Object.keys(manifest.bundles)) {
		const bundle = manifest.bundles[name];
		if (!bundle) {
			continue;
		}

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

function graphNode(name: string, graph: Record<string, QwikBundle>) {
	const bundle = graph[name];
	if (!bundle) {
		return { name, deps: [] };
	}

	const deps: Array<string | number> = [...new Set(bundle.imports ?? [])].sort();
	const dynamicImports = [...new Set(bundle.dynamicImports ?? [])].sort();
	if (dynamicImports.length > 0) {
		deps.push(-5, ...dynamicImports);
	}
	return { name, deps };
}

function getSymbolHash(symbolName: string) {
	const index = symbolName.lastIndexOf('_');
	if (index > -1) {
		return symbolName.slice(index + 1);
	}
	return symbolName;
}

function hash(value: string) {
	let next = 5381;
	for (let i = 0; i < value.length; i++) {
		next = (next * 33) ^ value.charCodeAt(i);
	}

	return (next >>> 0).toString(36);
}
