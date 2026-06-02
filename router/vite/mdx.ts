import { extname } from 'pathe';
import { mdxToJs } from 'satteri';
import { decodePath, parseURL } from 'ufo';
import type { RouterMdxOptions } from './types.ts';

export async function transformMdxRoute(
	source: string,
	id: string,
	options: RouterMdxOptions = {},
) {
	const result = await Promise.resolve(
		mdxToJs(source, {
			filename: id,
			jsxImportSource: '@qwik.dev/core',
			providerImportSource: options.providerImportSource,
			elementAttributeNameCase: 'html',
		}),
	);
	return result.code;
}

export function isMdxRoute(id: string) {
	return extname(decodePath(parseURL(id).pathname)).toLowerCase() === '.mdx';
}
