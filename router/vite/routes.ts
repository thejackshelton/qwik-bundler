import { basename, extname } from 'pathe';
import { parsePath, withTrailingSlash } from 'ufo';

type RouteLayout = { name: string; pathname: string };

export function routeBasename(filePath: string) {
	const name = routeFileName(filePath);
	const marker = name.search(/[.@-]/);
	if (marker === -1) {
		return name;
	}
	return name.slice(0, marker);
}

export function layoutName(filePath: string) {
	const name = routeFileName(filePath);
	return name.startsWith('layout-') ? name.slice('layout-'.length) : '';
}

export function routeLayouts<T extends RouteLayout>(
	layouts: T[],
	pathname: string,
	filePath: string,
) {
	const name = routeLayoutName(filePath);
	if (!name) {
		return layouts.filter(
			(layout) => !layout.name && routeUsesLayout(pathname, layout.pathname),
		);
	}
	const selected = layouts
		.filter((layout) => layout.name === name && routeUsesLayout(pathname, layout.pathname))
		.sort((a, b) => b.pathname.length - a.pathname.length)[0];
	if (!selected) {
		return [];
	}
	return [
		...layouts.filter(
			(layout) =>
				!layout.name &&
				layout.pathname !== selected.pathname &&
				routeUsesLayout(selected.pathname, layout.pathname),
		),
		selected,
	];
}

function routeFileName(filePath: string) {
	const pathname = parsePath(filePath).pathname;
	const name = basename(pathname, extname(pathname));
	return name.endsWith('!') ? name.slice(0, -1) : name;
}

export function routeLayoutName(filePath: string) {
	const name = routeFileName(filePath);
	const marker = name.indexOf('@');
	return marker === -1 ? '' : name.slice(marker + 1);
}

function routeUsesLayout(routePathname: string, layoutPathname: string) {
	return (
		layoutPathname === '/' ||
		routePathname === layoutPathname ||
		routePathname.startsWith(withTrailingSlash(layoutPathname))
	);
}
