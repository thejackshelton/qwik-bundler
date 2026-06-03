import { extname } from 'pathe';
import { defineHastPlugin, mdxToJs, type HastPluginDefinition } from 'satteri';
import { decodePath, parseURL } from 'ufo';
import type { RouterMdxOptions } from './types.ts';

type ContentHeading = {
	text: string;
	id: string;
	level: number;
};

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const NON_SLUG_CHAR = /[^a-z0-9 -]/g;
const SLUG_SEPARATOR = /[ -]+/g;

export async function transformMdxRoute(
	source: string,
	id: string,
	options: RouterMdxOptions = {},
) {
	const headings: ContentHeading[] = [];
	const result = await Promise.resolve(
		mdxToJs(source, {
			filename: id,
			jsxImportSource: '@qwik.dev/core',
			providerImportSource: options.providerImportSource,
			elementAttributeNameCase: 'html',
			hastPlugins: [createHeadingsPlugin(headings)],
		}),
	);
	return `${result.code}\nexport const headings = ${JSON.stringify(headings)};\n`;
}

export function isMdxRoute(id: string) {
	return extname(decodePath(parseURL(id).pathname)).toLowerCase() === '.mdx';
}

function createHeadingsPlugin(headings: ContentHeading[]): HastPluginDefinition {
	const slugs = new Map<string, number>();

	return defineHastPlugin({
		name: 'qwik-router-mdx-headings',
		element: {
			filter: HEADING_TAGS,
			visit(node, context) {
				const text = context.textContent(node);
				const existingId = headingId(node.properties.id);
				const id = existingId ?? uniqueHeadingSlug(text, slugs);
				if (!existingId) {
					context.setProperty(node, 'id', id);
				}
				headings.push({
					text,
					id,
					level: Number(node.tagName.slice(1)),
				});
			},
		},
	});
}

function headingId(value: unknown) {
	return typeof value === 'string' && value ? value : null;
}

function uniqueHeadingSlug(text: string, slugs: Map<string, number>) {
	const base = slugify(text) || 'heading';
	const count = slugs.get(base) ?? 0;
	slugs.set(base, count + 1);
	return count ? `${base}-${count}` : base;
}

function slugify(text: string) {
	return text.toLowerCase().trim().replace(NON_SLUG_CHAR, '').replace(SLUG_SEPARATOR, '-');
}
