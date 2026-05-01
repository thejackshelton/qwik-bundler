import type { SegmentAnalysis } from '@qwik.dev/optimizer';
import { relative } from 'pathe';
import type { OutputBundle } from 'rolldown';

export type QwikManifest = Record<string, any>;

export const QWIK_MANIFEST = 'globalThis.__QWIK_MANIFEST__';

const HANDLERS = ['_chk', '_rsc', '_res', '_run', '_task', '_val', '_eaC', '_eaT', '_suC', '_suT'];

export function createManifest(
	bundle: OutputBundle,
	segments: Map<string, SegmentAnalysis>,
	root: string | undefined,
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
			let size: number;
			if (typeof item.source === 'string') {
				size = item.source.length;
			} else {
				size = item.source.byteLength;
			}

			manifest.assets[item.fileName] = {
				name: item.names[0] ?? item.name,
				size,
			};
			continue;
		}
		const names = item.exports.filter((name) => segments.has(name));
		for (const name of names) {
			manifest.mapping[name] = item.fileName;
			manifest.symbols[name] = segments.get(name);
		}
		manifest.bundles[item.fileName] = {
			size: item.code.length,
			total: item.code.length,
			symbols: names,
		};
		if (root) {
			manifest.bundles[item.fileName].origins = item.moduleIds.map((id) =>
				relative(root, id),
			);
		}
		if (item.name === 'handlers' || item.moduleIds.some((id) => id.endsWith('handlers.mjs'))) {
			for (const symbol of HANDLERS) manifest.mapping[symbol] = item.fileName;
		}
	}
	manifest.manifestHash = hash(JSON.stringify(manifest.mapping));
	return manifest;
}

export function injectManifest(code: string, manifest: QwikManifest | null) {
	let value = QWIK_MANIFEST;
	if (manifest) {
		value = JSON.stringify({
			manifestHash: manifest.manifestHash,
			mapping: manifest.mapping,
			injections: [],
		});
	}

	return code.replaceAll(`!${QWIK_MANIFEST}`, 'false').replaceAll(QWIK_MANIFEST, value);
}

function hash(value: string) {
	let next = 5381;
	for (let i = 0; i < value.length; i++) {
		next = (next * 33) ^ value.charCodeAt(i);
	}

	return (next >>> 0).toString(36);
}
