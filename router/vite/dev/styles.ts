import { parsePath, withQuery } from 'ufo';
import { isCSSRequest } from 'vite';
import type { DevEnvironment, EnvironmentModuleNode, HtmlTagDescriptor, ViteDevServer } from 'vite';
import type { EnvironmentModuleGraphLike } from '../types.ts';

export function getRouterIndexTags(server: ViteDevServer): HtmlTagDescriptor[] {
	return getDevStyleLinks(server).map(({ href, timestamp }) => ({
		tag: 'link',
		attrs: { rel: 'stylesheet', href: styleHref(href, timestamp) },
	}));
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
	for (const mod of modules) {
		if (isCssModule(mod) && mod.importers.size === 0 && !visited.has(mod)) {
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

function getUrlPathname(url: string) {
	return parsePath(url).pathname;
}

function isJsSourceRequest(path: string) {
	return /\.[cm]?[jt]sx?$/.test(path);
}
