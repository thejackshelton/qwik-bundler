import { extname } from 'pathe';
import { optimize as optimizeSvgm, type OptimizeOptions as SvgmOptimizeOptions } from 'svgm-node';
import { parsePath, parseQuery, stringifyParsedURL, stringifyQuery, type QueryObject } from 'ufo';
import type { PluginOption } from 'vite';
import type { OutputFormat } from 'vite-imagetools';
import type { QwikRouterVitePluginOptions } from './types.ts';

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
	'.jpg',
	'.jpeg',
	'.png',
	'.webp',
	'.gif',
	'.avif',
	'.tiff',
]);
const JSX_QUERY_PARAM = 'jsx';
const INTERNAL_IMAGE_JSX_QUERY_PARAM = 'qwik-asset-jsx';
const SVG_IMAGE_JSX_QUERY_PARAM = 'qwik-svg-jsx';
const VIRTUAL_IMAGE_JSX_PREFIX = 'virtual:';
const VIRTUAL_IMAGE_JSX_SUFFIX = '.qwik.jsx';
const TO_IMG_ID = '@to-img.qwik.jsx';
const VIRTUAL_TO_IMG_ID = 'virtual:to-img.qwik.jsx';
const SVG_DOCUMENT =
	/^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!doctype[\s\S]*?>\s*)?<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i;
const SVG_SELF_CLOSING_DOCUMENT =
	/^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!doctype[\s\S]*?>\s*)?<svg\b([^>]*)\/>\s*$/i;
const SVG_ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

type ParsedImageId = {
	pathId: string;
	params: URLSearchParams;
};
type AstParser = (code: string) => {
	body?: unknown[];
};

export function createVirtualImageJsxId(pathId: string, params: URLSearchParams) {
	return withImageQuery(
		`${VIRTUAL_IMAGE_JSX_PREFIX}${pathId}${VIRTUAL_IMAGE_JSX_SUFFIX}`,
		imageQuery(params, [INTERNAL_IMAGE_JSX_QUERY_PARAM]),
	);
}

export function createImageJsxImportId(pathId: string, params: URLSearchParams) {
	return withImageQuery(pathId, imageQuery(params, [], { [INTERNAL_IMAGE_JSX_QUERY_PARAM]: '' }));
}

export function createSvgImageJsxImportId(pathId: string, params: URLSearchParams) {
	return withImageQuery(
		pathId,
		imageQuery(params, [INTERNAL_IMAGE_JSX_QUERY_PARAM, SVG_IMAGE_JSX_QUERY_PARAM, 'raw'], {
			raw: '',
			[SVG_IMAGE_JSX_QUERY_PARAM]: '',
		}),
	);
}

export function parseVirtualImageJsxId(id: string) {
	const parsed = parseImageId(id);
	if (
		!parsed.pathId.startsWith(VIRTUAL_IMAGE_JSX_PREFIX) ||
		!parsed.pathId.endsWith(VIRTUAL_IMAGE_JSX_SUFFIX)
	) {
		return null;
	}

	const pathId = parsed.pathId.slice(
		VIRTUAL_IMAGE_JSX_PREFIX.length,
		-VIRTUAL_IMAGE_JSX_SUFFIX.length,
	);

	return {
		...parsed,
		extension: extname(pathId).toLowerCase(),
		pathId,
	};
}

export function parseSvgImageJsxId(id: string) {
	const parsed = parseImageId(id);
	if (
		extname(parsed.pathId).toLowerCase() !== '.svg' ||
		!parsed.params.has(JSX_QUERY_PARAM) ||
		!parsed.params.has('raw') ||
		!parsed.params.has(SVG_IMAGE_JSX_QUERY_PARAM)
	) {
		return null;
	}

	return {
		...parsed,
		extension: '.svg',
	};
}

export function imageJsxDirectives(params: URLSearchParams, options?: QwikRouterVitePluginOptions) {
	const explicitParams = Object.fromEntries(params.entries());
	delete explicitParams[JSX_QUERY_PARAM];
	delete explicitParams[INTERNAL_IMAGE_JSX_QUERY_PARAM];
	return new URLSearchParams({
		format: 'webp',
		quality: '75',
		w: '200;400;600;800;1200',
		withoutEnlargement: '',
		...options?.imageOptimization?.jsxDirectives,
		...explicitParams,
		as: 'jsx',
	});
}

export function imagePlugin(options?: QwikRouterVitePluginOptions): PluginOption[] {
	return [imageToolsPlugin(options), imageJsxPlugin(options)];
}

export function optimizeSvg(
	{ code, path }: { code: string; path: string },
	options?: QwikRouterVitePluginOptions,
) {
	const data = optimizeSvgm(code, svgmOptions(options)).data;
	const svgAttributes = svgComponentAttributes(data, path);

	return {
		data,
		svgAttributes,
	};
}

function svgmOptions(options?: QwikRouterVitePluginOptions): SvgmOptimizeOptions {
	return {
		preset: 'safe',
		...options?.imageOptimization?.svg,
	};
}

function imageToolsPlugin(options?: QwikRouterVitePluginOptions): PluginOption {
	return import('vite-imagetools')
		.then(({ imagetools }) =>
			imagetools({
				exclude: [],
				extendOutputFormats: imageOutputFormats,
				defaultDirectives: (url) => imageDefaultDirectives(url, options),
			}),
		)
		.catch((error) => {
			console.error(
				'Error loading vite-imagetools, image imports ("foo.png?jsx") are not available',
				error,
			);
			return null;
		}) as PluginOption;
}

function imageOutputFormats(builtins: Record<string, OutputFormat>) {
	return { ...builtins, jsx: imageJsxOutputFormat };
}

const imageJsxOutputFormat: OutputFormat = () => (metadatas) => {
	const srcSet = metadatas.map((meta) => `${meta.src} ${meta.width}w`).join(', ');
	const largestImage = metadatas.reduce<{ width?: number; height?: number } | null>(
		(current, next) => {
			if (!current || (next.width ?? 0) > (current.width ?? 0)) {
				return next;
			}
			return current;
		},
		null,
	);
	return {
		srcSet,
		width: largestImage?.width,
		height: largestImage?.height,
	};
};

function imageDefaultDirectives(url: URL, options?: QwikRouterVitePluginOptions) {
	if (!url.searchParams.has(JSX_QUERY_PARAM)) {
		return new URLSearchParams();
	}
	return imageJsxDirectives(url.searchParams, options);
}

function imageJsxPlugin(options?: QwikRouterVitePluginOptions): PluginOption {
	return {
		name: 'qwik-router-image-jsx',
		resolveId: {
			order: 'pre',
			async handler(id, importer, resolveOptions) {
				if (parseVirtualImageJsxId(id) || parseSvgImageJsxId(id)) {
					return null;
				}
				if (id.endsWith(TO_IMG_ID)) {
					return VIRTUAL_TO_IMG_ID;
				}

				const { pathId, params } = parseImageId(id);
				if (!params.has(JSX_QUERY_PARAM) || params.has(INTERNAL_IMAGE_JSX_QUERY_PARAM)) {
					return null;
				}

				const resolved = await this.resolve(pathId, importer, {
					...resolveOptions,
					skipSelf: true,
				});
				const resolvedId = parseImageId((resolved ?? { id: pathId }).id).pathId;
				const extension = extname(resolvedId).toLowerCase();

				if (extension !== '.svg' && !SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
					return null;
				}

				return {
					id:
						extension === '.svg'
							? createSvgImageJsxImportId(resolvedId, params)
							: createVirtualImageJsxId(resolvedId, params),
					moduleSideEffects: false,
				};
			},
		},
		load: {
			order: 'pre',
			async handler(id) {
				if (id === VIRTUAL_TO_IMG_ID) {
					return toImgModule();
				}

				const imageId = parseVirtualImageJsxId(id);
				if (!imageId) {
					return null;
				}

				return {
					code: 'export default undefined;',
					moduleSideEffects: false,
				};
			},
		},
		transform: {
			order: 'pre',
			handler(code, id) {
				const svgId = parseSvgImageJsxId(id);
				if (svgId) {
					const svgCode = parseSvgRawModule(code, (input) => this.parse(input));
					if (svgCode === null) {
						this.error(`Expected Vite raw SVG module for ${svgId.pathId}`);
					}
					const { svgAttributes } = optimizeSvg(
						{ code: svgCode, path: svgId.pathId },
						options,
					);
					return {
						code: createSvgJsxModule(svgAttributes),
						map: null,
					};
				}

				const imageId = parseVirtualImageJsxId(id);
				if (!imageId) {
					return null;
				}

				if (SUPPORTED_IMAGE_EXTENSIONS.has(imageId.extension)) {
					return {
						code: createImageJsxModule(imageId.pathId, imageId.params),
						map: null,
					};
				}

				return null;
			},
		},
	};
}

function parseSvgRawModule(code: string, parse: AstParser) {
	const trimmed = code.trim();
	if (trimmed.startsWith('<svg') || trimmed.startsWith('<?xml')) {
		return code;
	}

	for (const node of parse(code).body ?? []) {
		if (!isExportDefaultDeclaration(node)) continue;
		return stringLiteralValue(node.declaration);
	}
	return null;
}

function isExportDefaultDeclaration(node: unknown): node is {
	declaration: unknown;
	type: 'ExportDefaultDeclaration';
} {
	return (
		typeof node === 'object' &&
		node !== null &&
		'type' in node &&
		node.type === 'ExportDefaultDeclaration' &&
		'declaration' in node
	);
}

function stringLiteralValue(node: unknown) {
	if (
		typeof node === 'object' &&
		node !== null &&
		'type' in node &&
		node.type === 'Literal' &&
		'value' in node &&
		typeof node.value === 'string'
	) {
		return node.value;
	}
	return null;
}

function svgComponentAttributes(data: string, path: string) {
	const trimmed = data.trim();
	const match = trimmed.match(SVG_DOCUMENT) ?? trimmed.match(SVG_SELF_CLOSING_DOCUMENT);
	if (!match) {
		throw new Error(`Expected optimized SVG root in ${path}`);
	}

	const attributes = parseSvgAttributes(match[1] ?? '');
	attributes.dangerouslySetInnerHTML = match[2] ?? '';
	return attributes;
}

function parseSvgAttributes(code: string) {
	const attributes: Record<string, string> = {};
	for (const match of code.matchAll(SVG_ATTRIBUTE)) {
		const name = match[1];
		if (!name) continue;
		attributes[name] = decodeSvgAttribute(match[2] ?? match[3] ?? match[4] ?? '');
	}
	return attributes;
}

function decodeSvgAttribute(value: string) {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

function parseImageId(id: string): ParsedImageId {
	const parsed = parsePath(id);
	return {
		pathId: parsed.pathname,
		params: new URLSearchParams(parsed.search),
	};
}

function imageQuery(params: URLSearchParams, omit: string[], add: QueryObject = {}): QueryObject {
	const query: QueryObject = parseQuery(params.toString());
	for (const key of omit) {
		delete query[key];
	}
	return {
		...query,
		...add,
	};
}

function withImageQuery(pathId: string, query: QueryObject) {
	return stringifyParsedURL({
		pathname: pathId,
		search: stringifyQuery(query),
		hash: '',
	});
}

function toImgModule() {
	return `
import { _jsxSplit, _getVarProps as v, _getConstProps as c } from '@qwik.dev/core';
const decoding = 'async';
const loading = 'lazy';
export default (s, w, h) =>
	p => p
		? _jsxSplit('img', { decoding, loading, ...v(p) }, { ...c(p), height: h, srcSet: s, width: w })
		: _jsxSplit('img', null, { decoding, height: h, loading, srcSet: s, width: w });
`;
}

function createImageJsxModule(pathId: string, params: URLSearchParams) {
	return `
import { srcSet, width, height } from ${JSON.stringify(createImageJsxImportId(pathId, params))};
import toImg from ${JSON.stringify(TO_IMG_ID)};

export default toImg(srcSet, width, height);
`;
}

function createSvgJsxModule(attrs: Record<string, string>) {
	return `
import { _jsxSplit } from '@qwik.dev/core';
const attrs = ${JSON.stringify(attrs)};
export default p => _jsxSplit('svg', p ? { ...p, ...attrs } : null, p ? null : attrs, null, 0);
`;
}
