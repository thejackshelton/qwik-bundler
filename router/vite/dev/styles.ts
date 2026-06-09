import { parsePath, withQuery } from 'ufo';
import { isCSSRequest } from 'vite';
import type { DevEnvironment, EnvironmentModuleNode, HtmlTagDescriptor, ViteDevServer } from 'vite';
import { headStylesheet } from '../../../src/vite/dev-tags.ts';
import type { GlobalInjections } from '../../../src/types.ts';
import type { EnvironmentModuleGraphLike } from '../types.ts';

export const ROUTER_DEV_STYLES_ID = 'virtual:qwik-router/dev-styles.css';

const RESOLVED_ROUTER_DEV_STYLES_ID = `\0${ROUTER_DEV_STYLES_ID}`;

/**
 * The router's dev CSS is one stylesheet link to a virtual module served through Vite's own CSS
 * pipeline. Its `@import`s are collected from the live module graphs, and Vite compiles them,
 * tracks them as dependencies, and hot-swaps the link when any of them change. Resumable Qwik
 * needs this explicit collection because it never imports CSS in the browser the way frameworks
 * that execute components there do.
 */
export function routerDevTags(base: string): GlobalInjections[] {
	return [headStylesheet(base, `/@id/${ROUTER_DEV_STYLES_ID}`)];
}

export function getRouterIndexTags(server: ViteDevServer): HtmlTagDescriptor[] {
	return getDevStyleLinks(server).map(({ href, timestamp }) => ({
		tag: 'link',
		attrs: { rel: 'stylesheet', href: styleHref(href, timestamp) },
	}));
}

/** Vite marks stylesheet requests with ?direct, so resolution must keep the query. */
export function resolveRouterDevStyles(id: string) {
	const [base, query] = id.split('?');
	if (base !== ROUTER_DEV_STYLES_ID) {
		return null;
	}
	return query ? `${RESOLVED_ROUTER_DEV_STYLES_ID}?${query}` : RESOLVED_ROUTER_DEV_STYLES_ID;
}

export function loadRouterDevStyles(id: string, server: ViteDevServer | undefined) {
	if (id.split('?')[0] !== RESOLVED_ROUTER_DEV_STYLES_ID) {
		return null;
	}
	if (!server) {
		return '';
	}
	return getDevStyleLinks(server)
		.map(({ href }) => `@import "${href}";\n`)
		.join('');
}

/**
 * Vite caches the virtual stylesheet and invalidates it when one of its current imports changes,
 * but the real input to `loadRouterDevStyles` is the module graph itself: when a CSS module is
 * transformed for the first time the collected set grows, and the cached stylesheet is missing
 * it. The router plugin calls this on each first-seen CSS module so the next page load
 * recomputes the stylesheet.
 */
export function invalidateRouterDevStyles(server: ViteDevServer) {
	const moduleGraph = server.environments.client?.moduleGraph;
	for (const id of [RESOLVED_ROUTER_DEV_STYLES_ID, `${RESOLVED_ROUTER_DEV_STYLES_ID}?direct`]) {
		const styles = moduleGraph?.getModuleById(id);
		if (styles) {
			moduleGraph.invalidateModule(styles);
		}
	}
}

function styleHref(href: string, timestamp: number) {
	if (!timestamp) {
		return href;
	}
	return withQuery(href, { t: timestamp });
}

function getDevStyleLinks(server: ViteDevServer) {
	const styles = new Map<string, { href: string; timestamp: number }>();
	for (const environment of getStyleEnvironments(server)) {
		for (const mod of getStyleModulesInImportOrder(environment.moduleGraph)) {
			const href = getUrlPathname(mod.url);
			const existing = styles.get(href);
			const timestamp = Math.max(existing?.timestamp ?? 0, mod.lastHMRTimestamp || 0);
			if (!existing) {
				styles.set(href, { href, timestamp });
			} else {
				existing.timestamp = timestamp;
			}
		}
	}
	return [...styles.values()];
}

function getStyleEnvironments(server: ViteDevServer): DevEnvironment[] {
	const environments = Object.values(server.environments);
	const client = server.environments.client;
	if (!client) {
		return environments;
	}
	return [client, ...environments.filter((environment) => environment !== client)];
}

function getStyleModulesInImportOrder(moduleGraph: EnvironmentModuleGraphLike) {
	const modules = [...moduleGraph.idToModuleMap.values()];
	const styles: EnvironmentModuleNode[] = [];
	const visited = new Set<EnvironmentModuleNode>();
	for (const root of modules) {
		if (!isJavaScriptEntryModule(root)) {
			continue;
		}
		addImportedStyles(root, visited, styles);
	}
	for (const root of modules) {
		if (!isJsSourceRequest(getUrlPathname(root.url))) {
			continue;
		}
		addImportedStyles(root, visited, styles);
	}
	for (const mod of modules) {
		if (isCssModule(mod) && shouldIncludeUnvisitedCssModule(mod) && !visited.has(mod)) {
			visited.add(mod);
			styles.push(mod);
		}
	}
	return styles;
}

function addImportedStyles(
	mod: EnvironmentModuleNode,
	visited: Set<EnvironmentModuleNode>,
	styles: EnvironmentModuleNode[],
) {
	for (const imported of mod.importedModules) {
		if (visited.has(imported) || hasCssImporter(imported)) {
			continue;
		}
		visited.add(imported);
		if (isCssModule(imported)) {
			styles.push(imported);
			continue;
		}
		addImportedStyles(imported, visited, styles);
	}
}

function isJavaScriptEntryModule(mod: EnvironmentModuleNode) {
	return isJsSourceRequest(getUrlPathname(mod.url)) && mod.importers.size === 0;
}

function isCssModule(mod: EnvironmentModuleNode) {
	const href = getUrlPathname(mod.url);
	return href === mod.url && isCSSRequest(href);
}

function hasCssImporter(mod: EnvironmentModuleNode) {
	return [...mod.importers].some((importer) => isCSSRequest(getUrlPathname(importer.url)));
}

function shouldIncludeUnvisitedCssModule(mod: EnvironmentModuleNode) {
	return (
		mod.importers.size === 0 ||
		[...mod.importers].some((importer) => isJsSourceRequest(getUrlPathname(importer.url)))
	);
}

function getUrlPathname(url: string) {
	return parsePath(url).pathname;
}

function isJsSourceRequest(path: string) {
	return /\.[cm]?[jt]sx?$/.test(path);
}
