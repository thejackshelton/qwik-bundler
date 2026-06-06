import { dirname } from 'pathe';
import { parsePath, withLeadingSlash, withoutLeadingSlash, withoutTrailingSlash } from 'ufo';
import { layoutName, routeBasename, routeLayoutName, routeLayouts } from './routes.ts';

type ModuleLoader = () => unknown;
type RuntimeLayout = { name: string; pathname: string; loader: ModuleLoader };
type RouteSegment = { key: string; param?: string };
interface RouteNode {
	[key: string]: RouteNode | ModuleLoader | ModuleLoader[] | string | undefined;
}

export function createRoutes(modules: Record<string, unknown>, eager: boolean, routesBase: string) {
	const root: RouteNode = {};
	const layouts: RuntimeLayout[] = [];
	const paths = Object.keys(modules).sort();
	for (const path of paths) {
		if (routeBasename(path) !== 'layout') continue;
		const pathname = routePathname(path, routesBase);
		const name = layoutName(path);
		const loader = routeLoader(modules, path, eager);
		layouts.push({ name, pathname, loader });
		if (!name) {
			routeNode(root, pathname)._L = loader;
		}
	}
	for (const path of paths) {
		const name = routeBasename(path);
		if (name !== 'index' && name !== '404' && name !== 'error') continue;
		const pathname = routePathname(path, routesBase);
		const record = routeNode(root, pathname);
		const loader = routeLoader(modules, path, eager);
		if (name === '404') record._4 = loader;
		else if (name === 'error') record._E = loader;
		else {
			const selectedLayouts = routeLayoutName(path)
				? routeLayouts(layouts, pathname, path).map((layout) => layout.loader)
				: [];
			record._I = selectedLayouts.length ? [...selectedLayouts, loader] : loader;
		}
	}
	return root;
}

function routeLoader(modules: Record<string, unknown>, path: string, eager: boolean): ModuleLoader {
	return eager ? () => modules[path] : (modules[path] as ModuleLoader);
}

function routeNode(root: RouteNode, pathname: string) {
	let current = root;
	for (const segment of routeSegments(pathname)) {
		const next = current[segment.key] as RouteNode | undefined;
		current = next || ((current[segment.key] = {}) as RouteNode);
		if (segment.param) current._P = segment.param;
	}
	return current;
}

function routeSegments(pathname: string): RouteSegment[] {
	const result: RouteSegment[] = [];
	for (const segment of withoutLeadingSlash(pathname).split('/').filter(Boolean)) {
		if (segment.startsWith('(') && segment.endsWith(')')) continue;
		const rest = /^\[\.\.\.(.+)\]$/.exec(segment);
		if (rest?.[1]) {
			result.push({ key: '_A', param: rest[1] });
			continue;
		}
		const dynamic = /^\[(.+)\]$/.exec(segment);
		if (dynamic?.[1]) {
			result.push({ key: '_W', param: dynamic[1] });
			continue;
		}
		result.push({ key: segment.toLowerCase() });
	}
	return result;
}

function routePathname(path: string, routesBase: string) {
	const dir = dirname(parsePath(path).pathname);
	const rel = withoutTrailingSlash(
		withoutLeadingSlash(dir.startsWith(routesBase) ? dir.slice(routesBase.length) : dir),
	);
	return rel ? withLeadingSlash(rel) : '/';
}
