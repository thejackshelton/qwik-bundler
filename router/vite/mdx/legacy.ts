/*
 * Deprecated MDX compatibility for existing remark/rehype plugin configs.
 * This intentionally uses the JavaScript unified pipeline instead of Satteri's
 * native Rust/oxc pipeline because Satteri does not execute unified plugins.
 * New integrations should use Satteri `mdastPlugins` and `hastPlugins`.
 */
import type { CompileOptions } from '@mdx-js/mdx';
import {
	createHeadingSlugger,
	headingId,
	headingLevel,
	headingLinkNode,
	isHeadingTag,
	type ContentHeading,
} from './headings.ts';
import { resolveRouterMdxOptions } from './options.ts';
import type { RouterLegacyMdxPlugin, RouterMdxOptions, RouterMdxPlugins } from '../types.ts';

type HastElement = {
	type: 'element';
	tagName: string;
	properties?: Record<string, unknown>;
	children?: HastNode[];
};

type HastNode =
	| HastElement
	| {
			type: string;
			value?: unknown;
			children?: HastNode[];
	  };

type RehypeTree = {
	children?: HastNode[];
};

export function usesLegacyMdxCompat(options: RouterMdxOptions = {}) {
	return !!(options.remarkPlugins?.length || options.rehypePlugins?.length);
}

export async function transformLegacyMdxRoute(
	source: string,
	id: string,
	options: RouterMdxOptions = {},
	mdxPlugins: RouterMdxPlugins = {},
) {
	const { compile } = await import('@mdx-js/mdx');
	const { default: remarkGfm } = await import('remark-gfm');
	const headings: ContentHeading[] = [];
	const resolvedOptions = resolveRouterMdxOptions(options, mdxPlugins);
	const {
		autolinkHeadings: _autolinkHeadings,
		features: _features,
		gfm: _gfm,
		hastPlugins: _hastPlugins,
		mdastPlugins: _mdastPlugins,
		optimizeStatic: _optimizeStatic,
		remarkPlugins = [],
		rehypePlugins = [],
		...compileOptions
	} = options;
	const legacyRemarkPlugins: RouterLegacyMdxPlugin[] = remarkPlugins.slice();
	if (resolvedOptions.gfm !== false) {
		legacyRemarkPlugins.push(remarkGfm);
	}
	const result = await compile({ value: source, path: id }, {
		...compileOptions,
		jsxImportSource: '@qwik.dev/core',
		elementAttributeNameCase: 'html',
		remarkPlugins: legacyRemarkPlugins as CompileOptions['remarkPlugins'],
		rehypePlugins: [
			rehypeHeadingIds,
			...(rehypePlugins as NonNullable<CompileOptions['rehypePlugins']>),
			[rehypeHeadings, headings, resolvedOptions.autolinkHeadings],
		],
	} satisfies CompileOptions);
	return `${String(result.value)}\nexport const headings = ${JSON.stringify(headings)};\n`;
}

function rehypeHeadingIds() {
	const headingSlug = createHeadingSlugger();
	return (tree: RehypeTree) => {
		visitElements(tree, (node) => {
			if (!isHeadingTag(node.tagName)) {
				return;
			}
			node.properties ??= {};
			if (headingId(node.properties.id)) {
				return;
			}
			node.properties.id = headingSlug(textContent(node));
		});
	};
}

function rehypeHeadings(headings: ContentHeading[], autolink: boolean) {
	return (tree: RehypeTree) => {
		visitElements(tree, (node) => {
			if (!isHeadingTag(node.tagName)) {
				return;
			}
			const id = headingId(node.properties?.id);
			if (!id) {
				return;
			}
			if (autolink) {
				node.children ??= [];
				node.children.push(headingLink(id));
			}
			headings.push({
				text: textContent(node),
				id,
				level: headingLevel(node.tagName),
			});
		});
	};
}

function visitElements(node: HastNode | RehypeTree, visit: (node: HastElement) => void) {
	if (isElement(node)) {
		visit(node);
	}
	for (const child of node.children ?? []) {
		visitElements(child, visit);
	}
}

function isElement(node: HastNode | RehypeTree): node is HastElement {
	return (node as { type?: unknown }).type === 'element';
}

function headingLink(id: string): HastElement {
	return headingLinkNode(id);
}

function textContent(node: HastNode): string {
	if ('value' in node && typeof node.value === 'string') {
		return node.value;
	}
	return (node.children ?? []).map(textContent).join('');
}
