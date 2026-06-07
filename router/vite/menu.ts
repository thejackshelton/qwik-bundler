import { dirname, extname, join, relative } from 'pathe';
import { defineMdastPlugin, markdownToHtml } from 'satteri';
import { decodePath, parseURL, withLeadingSlash, withTrailingSlash } from 'ufo';

type MenuItem = {
	text: string;
	href?: string;
	items?: MenuItem[];
};

type MenuTransformState = {
	base: string;
	routesDir: string;
};

export function isMenuRoute(id: string) {
	const pathname = decodePath(parseURL(id).pathname);
	const ext = extname(pathname).toLowerCase();
	return (
		(ext === '.md' || ext === '.mdx' || ext === '.markdown') &&
		pathname.slice(0, -ext.length).endsWith('/menu')
	);
}

export function transformMenuRoute(source: string, id: string, state: MenuTransformState) {
	const menu = collectMenu(source, id, state);
	return `export default ${JSON.stringify(menu)};`;
}

function collectMenu(source: string, id: string, state: MenuTransformState) {
	let currentDepth = 0;
	let root: MenuItem | null = null;
	const stack: MenuItem[] = [];

	markdownToHtml(source, {
		filename: id,
		mdastPlugins: [
			defineMdastPlugin({
				name: 'qwik-router-menu',
				heading(node, context) {
					const depth = node.depth;
					if (depth > currentDepth + 1) {
						throw new Error(`Menu hierarchy skipped a level in menu: ${id}`);
					}

					const item = menuItem(node, context.textContent(node), id, state);
					stack.length = depth - 1;
					const parent = stack.at(-1);
					if (parent) {
						(parent.items ??= []).push(item);
					} else {
						root = item;
					}
					stack.push(item);
					currentDepth = depth;
				},
				listItem(node, context) {
					const parent = stack.at(-1);
					if (!parent) {
						throw new Error(`Menu list item appears before a heading in menu: ${id}`);
					}
					(parent.items ??= []).push(
						menuItem(node, context.textContent(node), id, state),
					);
				},
			}),
		],
	});

	if (!root) {
		throw new Error(`Menu must start with an h1 in menu: ${id}`);
	}
	return root;
}

function menuItem(node: unknown, text: string, id: string, state: MenuTransformState): MenuItem {
	const href = linkUrl(node);
	const item: MenuItem = { text: text.trim() };
	if (href) {
		item.href = markdownUrl(id, href, state);
	}
	return item;
}

function linkUrl(node: unknown): string | undefined {
	if (!node || typeof node !== 'object') {
		return undefined;
	}
	const { children, type, url } = node as {
		children?: unknown[];
		type?: unknown;
		url?: unknown;
	};
	if (type === 'link' && typeof url === 'string') {
		return url;
	}
	return children?.length === 1 ? linkUrl(children[0]) : undefined;
}

function markdownUrl(id: string, href: string, state: MenuTransformState) {
	const url = parseURL(href);
	const ext = extname(url.pathname).toLowerCase();
	if (ext !== '.md' && ext !== '.mdx' && ext !== '.markdown') {
		return href.endsWith('/') ? href : withTrailingSlash(href);
	}

	const sourcePath = decodePath(parseURL(id).pathname);
	const pathname = decodePath(url.pathname);
	const filePath = pathname.startsWith('/')
		? join(state.routesDir, pathname)
		: join(dirname(sourcePath), pathname);
	const route = routePathFromFile(filePath, state);
	return `${route}${url.search}${url.hash}`;
}

function routePathFromFile(filePath: string, state: MenuTransformState) {
	const relativeFile = relative(state.routesDir, dirname(filePath));
	const segments = relativeFile
		.split('/')
		.filter(Boolean)
		.filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')));
	const pathname = segments.length ? withLeadingSlash(segments.join('/')) : '/';
	return withTrailingSlash(withLeadingSlash(join(state.base, pathname)));
}
