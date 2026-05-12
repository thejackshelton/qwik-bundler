import { defDGraph } from '@thi.ng/dgraph';
import type { QwikBundle, QwikManifest } from './manifest';

export type QwikBundleGraph = Array<string | number>;
type BundleGraphEdge = [string, string | null];

export function convertManifestToBundleGraph(manifest: QwikManifest): QwikBundleGraph {
	const graph = bundleGraphRecords(manifest);
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
			const dynamicImports = graph[name]?.dynamicImports ?? [];
			const deps: Array<string | number> = [...reduced.immediateDependencies(name)].sort();
			if (dynamicImports.length > 0) deps.push(-5, ...dynamicImports);
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

function bundleGraphRecords(manifest: QwikManifest) {
	const graph: Record<string, QwikBundle> = { ...manifest.bundles };
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

	for (const bundleName of Object.keys(graph)) {
		const qwikBundle = graph[bundleName];
		if (!qwikBundle) continue;

		graph[bundleName] = {
			...qwikBundle,
			imports: qwikBundle.imports?.filter((dep) => graph[dep]) ?? [],
			dynamicImports: qwikBundle.dynamicImports?.filter((dep) => graph[dep]) ?? [],
		};
	}
	return graph;
}

function* bundleGraphEdges(graph: Record<string, QwikBundle>): Generator<BundleGraphEdge> {
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
