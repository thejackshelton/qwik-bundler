import { load as parseYaml } from 'js-yaml';
import { markdownToMdast, type Features, type Frontmatter } from 'satteri';

type FrontmatterAttrs = Record<string, unknown>;

const metaNames: Record<string, true> = {
	author: true,
	creator: true,
	'color-scheme': true,
	description: true,
	generator: true,
	keywords: true,
	publisher: true,
	referrer: true,
	robots: true,
	'theme-color': true,
	viewport: true,
};

export function splitFrontmatter(source: string) {
	const block = firstFrontmatterBlock(source);
	if (!block) {
		return { source, frontmatter: null };
	}
	return {
		source: source.slice(block.endOffset).replace(/^\r?\n/, ''),
		frontmatter: block.frontmatter,
	};
}

export function withFrontmatterFeature(features: Features | undefined): Features {
	return { ...features, frontmatter: true };
}

export function frontmatterExports(frontmatter: Frontmatter | null | undefined) {
	const attrs = parseFrontmatterAttrs(frontmatter);
	const frontmatterExport = `export const frontmatter = ${JSON.stringify(attrs)};`;
	const head = frontmatterAttrsToDocumentHead(attrs);
	return head
		? `${frontmatterExport}\nexport const head = ${JSON.stringify(head)};`
		: frontmatterExport;
}

function firstFrontmatterBlock(source: string) {
	const node = firstFrontmatterNode(source);
	const endOffset = node?.position?.end.offset;
	if (!node || typeof endOffset !== 'number') {
		return null;
	}
	return {
		endOffset,
		frontmatter: {
			kind: node.type,
			value: node.value,
		},
	};
}

function firstFrontmatterNode(source: string): FrontmatterNode | null {
	const tree = markdownToMdast(source, { features: { frontmatter: true } });
	const first = 'children' in tree ? tree.children[0] : null;
	return isFrontmatterNode(first) ? first : null;
}

type FrontmatterNode = {
	type: 'yaml' | 'toml';
	value: string;
	position?: {
		end: {
			offset?: number;
		};
	};
};

function isFrontmatterNode(node: unknown): node is FrontmatterNode {
	return (
		typeof node === 'object' &&
		node !== null &&
		'type' in node &&
		'value' in node &&
		(node.type === 'yaml' || node.type === 'toml') &&
		typeof node.value === 'string'
	);
}

function parseFrontmatterAttrs(frontmatter: Frontmatter | null | undefined) {
	if (!frontmatter?.value.trim()) {
		return undefined;
	}
	const attrs = parseYaml(frontmatter.value);
	return attrs && typeof attrs === 'object' && !Array.isArray(attrs)
		? (attrs as FrontmatterAttrs)
		: undefined;
}

function frontmatterAttrsToDocumentHead(attrs: FrontmatterAttrs | undefined) {
	if (!attrs || Object.keys(attrs).length === 0) {
		return null;
	}

	const head = {
		title: '',
		meta: [] as Record<string, string | undefined>[],
		styles: [],
		links: [],
		scripts: [],
		frontmatter: {} as Record<string, unknown>,
	};

	for (const [attrName, attrValue] of Object.entries(attrs)) {
		if (attrValue == null) {
			continue;
		}
		if (attrName === 'title') {
			head.title = String(attrValue).replace(/\\@/g, '@');
		} else if (attrName === 'og' || attrName === 'opengraph') {
			for (const item of Array.isArray(attrValue) ? attrValue : [attrValue]) {
				if (!item || typeof item !== 'object' || Array.isArray(item)) {
					continue;
				}
				for (const [property, content] of Object.entries(item)) {
					if ((property === 'title' || property === 'description') && content === true) {
						if (property in attrs) {
							head.meta.push({
								property: `og:${property}`,
								content: String(attrs[property]),
							});
						}
					} else {
						head.meta.push({ property: `og:${property}`, content: String(content) });
					}
				}
			}
		} else if (metaNames[attrName]) {
			head.meta.push({ name: attrName, content: String(attrValue) });
		} else {
			head.frontmatter[attrName] = attrValue;
		}
	}

	return head;
}
