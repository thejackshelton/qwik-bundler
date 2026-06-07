import { extname } from 'pathe';
import { defineHastPlugin, mdxToJs, type HastNode, type HastPluginDefinition } from 'satteri';
import { decodePath, parseURL } from 'ufo';
import {
	createHeadingSlugger,
	headingId,
	headingLevel,
	headingLinkNode,
	HEADING_TAGS,
	type ContentHeading,
} from './headings.ts';
import { frontmatterExports, frontmatterModule, withFrontmatterFeature } from './frontmatter.ts';
import { transformLegacyMdxRoute, usesLegacyMdxCompat } from './legacy.ts';
import { resolveRouterMdxOptions } from './options.ts';
import type { RouterMdxOptions, RouterMdxPlugins } from '../types.ts';

const FRONTMATTER_QUERY_PARAM = 'qwik-router-frontmatter';

export async function transformMdxRoute(
	source: string,
	id: string,
	options: RouterMdxOptions = {},
	mdxPlugins: RouterMdxPlugins = {},
	hooks: TransformMdxRouteHooks = {},
) {
	if (usesLegacyMdxCompat(options)) {
		hooks.warnDeprecatedUnifiedMdx?.();
		return transformLegacyMdxRoute(source, id, options, mdxPlugins);
	}

	const headings: ContentHeading[] = [];
	const {
		autolinkHeadings: _autolinkHeadings,
		features: _features,
		gfm: _gfm,
		hastPlugins = [],
		mdastPlugins = [],
		rehypePlugins: _rehypePlugins,
		remarkPlugins: _remarkPlugins,
		...mdxOptions
	} = options;
	const resolvedOptions = resolveRouterMdxOptions(options, mdxPlugins);
	const result = await Promise.resolve(
		mdxToJs(source, {
			...mdxOptions,
			filename: id,
			jsxImportSource: '@qwik.dev/core',
			elementAttributeNameCase: 'html',
			features: withFrontmatterFeature(resolvedOptions.features),
			mdastPlugins,
			hastPlugins: [
				createHeadingIdsPlugin(),
				...hastPlugins,
				createHeadingsPlugin(headings, resolvedOptions.autolinkHeadings),
			],
		}),
	);
	return `${result.code}\n${frontmatterExports(result.frontmatter)}\nexport const headings = ${JSON.stringify(headings)};\n`;
}

export function isMdxRoute(id: string) {
	const ext = extname(decodePath(parseURL(id).pathname)).toLowerCase();
	return ext === '.md' || ext === '.mdx' || ext === '.markdown';
}

export function isMdxFrontmatterRoute(id: string) {
	return isMdxRoute(id) && new URLSearchParams(parseURL(id).search).has(FRONTMATTER_QUERY_PARAM);
}

export function transformMdxFrontmatterRoute(source: string) {
	return frontmatterModule(source);
}

function createHeadingIdsPlugin(): HastPluginDefinition {
	const headingSlug = createHeadingSlugger();

	return defineHastPlugin({
		name: 'qwik-router-mdx-heading-ids',
		element: {
			filter: HEADING_TAGS,
			visit(node, context) {
				const text = context.textContent(node);
				const existingId = headingId(node.properties.id);
				const id = existingId ?? headingSlug(text);
				if (!existingId) {
					context.setProperty(node, 'id', id);
				}
			},
		},
	});
}

function createHeadingsPlugin(headings: ContentHeading[], autolink: boolean): HastPluginDefinition {
	return defineHastPlugin({
		name: 'qwik-router-mdx-headings',
		element: {
			filter: HEADING_TAGS,
			visit(node, context) {
				const id = headingId(node.properties.id);
				if (!id) {
					return;
				}
				if (autolink) {
					context.appendChild(node, headingLink(id));
				}
				headings.push({
					text: context.textContent(node),
					id,
					level: headingLevel(node.tagName),
				});
			},
		},
	});
}

function headingLink(id: string): HastNode {
	return headingLinkNode(id) as HastNode;
}

type TransformMdxRouteHooks = {
	warnDeprecatedUnifiedMdx?: () => void;
};
