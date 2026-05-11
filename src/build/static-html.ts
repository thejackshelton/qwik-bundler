// Static CSR pages do not run Qwik's SSR renderer, so they do not get Qwik's preloader tags.
// Add those tags here: load the preloader, fetch bundle-graph.json, preload core, and preload
// lazy chunks reachable from the page's entry script.
// SSR/SSG pages already contain these tags, so we skip HTML marked with q:render="ssr".
// TODO: Move the bootstrap tag generation upstream into core so SSR and static HTML share it.
import type { OutputBundle } from 'rolldown';
import { joinURL } from 'ufo';
import { Q_BUILD_PREFIX } from './chunking';
import type { QwikManifest } from './manifest';

const MODULE_SCRIPT_TAG =
	/<script\b(?=[^>]*\btype\s*=\s*(['"])module\1)[^>]*\bsrc\s*=\s*(['"])(.*?)\2[^>]*>/gi;
const SSR_RENDER_ATTR = /\bq:render\s*=\s*(['"])ssr(?:-dev)?\1/i;
const URL_SUFFIX = /[?#]/;
const HEAD_CLOSE = /<\/head\s*>/i;

export function injectQwikPreloaderTags(bundle: OutputBundle, manifest: QwikManifest) {
	for (const item of Object.values(bundle)) {
		if (item.type !== 'asset') continue;
		if (!item.fileName.endsWith('.html')) continue;
		if (typeof item.source !== 'string') continue;
		if (SSR_RENDER_ATTR.test(item.source)) continue;

		const paths = assetPaths(item.source, manifest);
		const preloaderTags = qwikPreloaderTags(manifest, paths);
		if (!preloaderTags) continue;

		item.source = injectIntoHead(
			item.source,
			preloaderTags + reachablePreloads(item.source, manifest, paths.build),
		);
	}
}

function qwikPreloaderTags(manifest: QwikManifest, paths: AssetPaths) {
	const preloader = manifest.preloader && joinURL(paths.build, manifest.preloader);
	const graph = manifest.bundleGraphAsset && joinURL(paths.public, manifest.bundleGraphAsset);
	const core = manifest.core && joinURL(paths.build, manifest.core);
	return [
		preloader &&
			graph &&
			modulepreload(preloader) +
				`<link rel="preload" href="${graph}" as="fetch" crossorigin="anonymous">` +
				`<script type="module" async crossorigin="anonymous">` +
				`let b=fetch(${JSON.stringify(graph)});` +
				`import(${JSON.stringify(preloader)}).then(({l})=>l(${JSON.stringify(paths.build)},b));` +
				`</script>`,
		core && modulepreload(core),
	]
		.filter(Boolean)
		.join('');
}

function reachablePreloads(html: string, manifest: QwikManifest, buildBase: string) {
	const seen = new Set(
		[manifest.preloader, manifest.core].filter((name): name is string => !!name),
	);
	const stack = [...html.matchAll(MODULE_SCRIPT_TAG)].flatMap((match) => {
		const entry = scriptBundle(match[3] ?? '', manifest);
		if (!entry) return [];
		seen.add(entry);
		return deps(manifest, entry);
	});
	const tags: string[] = [];

	while (stack.length) {
		const name = stack.pop()!;
		if (seen.has(name)) continue;
		seen.add(name);
		if (manifest.bundles[name]) tags.push(modulepreload(joinURL(buildBase, name)));
		stack.push(...deps(manifest, name));
	}

	return tags.join('');
}

function deps(manifest: QwikManifest, name: string) {
	const bundle = manifest.bundles[name];
	return bundle ? [...(bundle.imports ?? []), ...(bundle.dynamicImports ?? [])] : [];
}

type AssetPaths = { public: string; build: string };

function assetPaths(html: string, manifest: QwikManifest): AssetPaths {
	for (const match of html.matchAll(MODULE_SCRIPT_TAG)) {
		const src = cleanUrl(match[3] ?? '');
		const bundle = scriptBundle(src, manifest);
		if (!bundle) continue;

		const base = src.endsWith(`/${Q_BUILD_PREFIX}${bundle}`)
			? src.slice(0, -`${Q_BUILD_PREFIX}${bundle}`.length)
			: src.slice(0, -bundle.length);
		return { public: base, build: bundle.includes('/') ? base : joinURL(base, Q_BUILD_PREFIX) };
	}

	return { public: '/', build: `/${Q_BUILD_PREFIX}` };
}

function scriptBundle(path: string, manifest: QwikManifest) {
	const value = cleanUrl(path);
	return Object.keys(manifest.bundles).find(
		(name) =>
			value === name ||
			value.endsWith(`/${name}`) ||
			value.endsWith(`/${Q_BUILD_PREFIX}${name}`),
	);
}

function cleanUrl(path: string) {
	const value = path.split(URL_SUFFIX, 1)[0] ?? '';
	return value;
}

function injectIntoHead(html: string, tags: string) {
	const index = html.search(HEAD_CLOSE);
	return index < 0 ? tags + html : html.slice(0, index) + tags + html.slice(index);
}

function modulepreload(href: string) {
	return `<link rel="modulepreload" href="${href}">`;
}
