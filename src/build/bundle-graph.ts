import { defDGraph } from '@thi.ng/dgraph';
import type { BundleGraphAdder, QwikBundle, QwikBundleGraph, QwikManifest } from '../types';

type BundleGraphEdge = [string, string | null];
type BundleGraphRecord = Partial<QwikBundle>;

const MINIMUM_CONNECTION_BYTES_PER_SECOND = (300 * 1024) / 8;
const SLOW_BUNDLE_TOTAL = MINIMUM_CONNECTION_BYTES_PER_SECOND * 0.5;
const SMALL_BUNDLE_TOTAL = 1000;

export function convertManifestToBundleGraph(
	manifest: QwikManifest,
	bundleGraphAdders?: Set<BundleGraphAdder>,
): QwikBundleGraph {
	const graph = bundleGraphRecords(manifest, bundleGraphAdders);
	const dag = defDGraph(bundleGraphEdges(graph));
	const reduced = dag.copy();
	for (const name of dag.nodes()) {
		for (const dep of dag.immediateDependencies(name)) {
			for (const transitive of dag.transitiveDependencies(dep)) {
				reduced.removeEdge(name, transitive);
			}
		}
	}

	const nodes = Object.keys(graph)
		.sort()
		.map((name) => {
			const bundle = graph[name];
			const dynamicImports = (bundle?.dynamicImports ?? [])
				.map((dep) => [dep, dynamicImportMarker(bundle, graph[dep])] as const)
				.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
			const deps: Array<string | number> = [...reduced.immediateDependencies(name)].sort();
			let lastMarker: number | undefined;
			for (const [dep, marker] of dynamicImports) {
				if (marker !== lastMarker) {
					deps.push(marker);
					lastMarker = marker;
				}
				deps.push(dep);
			}
			return [name, deps] as const;
		});
	const indexes = new Map<string, number>();
	let index = 0;
	for (const [name, deps] of nodes) {
		indexes.set(name, index);
		index += 1 + deps.length;
	}
	return nodes.flatMap(([name, deps]) => [
		name,
		...deps.map((dep) => (typeof dep === 'number' ? dep : indexes.get(dep)!)),
	]);
}

function bundleGraphRecords(manifest: QwikManifest, bundleGraphAdders?: Set<BundleGraphAdder>) {
	const graph: Record<string, BundleGraphRecord> = { ...manifest.bundles };
	for (const [symbol, bundleName] of Object.entries(manifest.mapping)) {
		if (manifest.symbols[symbol]?.ctxKind === 'eventHandler' && manifest.mapping._run) {
			const bundle = graph[bundleName];
			if (bundle && bundleName !== manifest.mapping._run) {
				graph[bundleName] = {
					...bundle,
					imports: [...new Set([...(bundle.imports ?? []), manifest.mapping._run])],
				};
			}
		}

		if (symbol.startsWith('_') && symbol.length < 10) {
			continue;
		}

		const symbolHash = getSymbolHash(symbol);
		if (symbolHash) {
			const bundle = manifest.bundles[bundleName];
			graph[symbolHash] = {
				size: 0,
				total: 0,
				imports: bundle?.imports ? [...bundle.imports] : undefined,
				dynamicImports: [bundleName],
			};
		}
	}
	if (bundleGraphAdders) {
		const combined = { ...manifest, bundles: graph as QwikManifest['bundles'] };
		for (const add of bundleGraphAdders) {
			Object.assign(graph, add(combined));
		}
	}

	for (const bundleName of Object.keys(graph)) {
		const qwikBundle = graph[bundleName];
		if (!qwikBundle) continue;

		graph[bundleName] = {
			...qwikBundle,
			imports: qwikBundle.imports?.filter((dep) => graph[dep]) ?? [],
			dynamicImports:
				qwikBundle.dynamicImports?.filter(
					(dep) => isSymbolGraphNode(qwikBundle) || hasQwikSymbols(dep, graph),
				) ?? [],
		};
	}
	const used = new Set<string>();
	for (const bundle of Object.values(graph)) {
		for (const dep of bundle.imports ?? []) used.add(dep);
		for (const dep of bundle.dynamicImports ?? []) used.add(dep);
	}
	for (const [bundleName, bundle] of Object.entries(graph)) {
		if (!used.has(bundleName) && !bundle.imports?.length && !bundle.dynamicImports?.length) {
			delete graph[bundleName];
		}
	}
	return graph;
}

function isSymbolGraphNode(bundle: BundleGraphRecord) {
	return bundle.size === 0 && bundle.total === 0 && bundle.dynamicImports?.length === 1;
}

function hasQwikSymbols(dep: string, graph: Record<string, BundleGraphRecord>) {
	return !!graph[dep]?.symbols;
}

function dynamicImportMarker(
	bundle: BundleGraphRecord | undefined,
	dependency: BundleGraphRecord | undefined,
) {
	let probability = 0.5 + (dependency?.interactivity ?? 0) * 0.08;
	if (hasRelatedOrigin(bundle, dependency)) probability += 0.25;
	if ((dependency?.total ?? 0) > SLOW_BUNDLE_TOTAL)
		probability += probability > 0.5 ? 0.02 : -0.02;
	if ((dependency?.total ?? 0) < SMALL_BUNDLE_TOTAL) probability += 0.15;
	probability = Math.min(probability, 0.99);
	return -Math.round(probability * 10);
}

function hasRelatedOrigin(
	bundle: BundleGraphRecord | undefined,
	dependency: BundleGraphRecord | undefined,
) {
	return !!bundle?.origins?.some((origin) =>
		dependency?.origins?.some((depOrigin) => depOrigin.startsWith(origin)),
	);
}

function* bundleGraphEdges(graph: Record<string, BundleGraphRecord>): Generator<BundleGraphEdge> {
	for (const [bundleName, bundle] of Object.entries(graph)) {
		yield [bundleName, null];
		for (const dep of bundle.imports ?? []) {
			yield [bundleName, dep];
		}
	}
}

function getSymbolHash(symbolName: string) {
	return symbolName.slice(symbolName.lastIndexOf('_') + 1);
}
