import type { Features } from 'satteri';
import type { RouterMdxOptions, RouterMdxPlugins } from '../types.ts';

export type ResolvedRouterMdxOptions = {
	autolinkHeadings: boolean;
	features: Features | undefined;
	gfm: boolean | undefined;
};

export function resolveRouterMdxOptions(
	options: RouterMdxOptions,
	mdxPlugins: RouterMdxPlugins,
): ResolvedRouterMdxOptions {
	const gfm = options.gfm ?? mdxPlugins.remarkGfm;
	return {
		autolinkHeadings: options.autolinkHeadings ?? mdxPlugins.rehypeAutolinkHeadings ?? true,
		features: resolveFeatures(options.features, gfm),
		gfm,
	};
}

function resolveFeatures(features: Features | undefined, gfm: boolean | undefined) {
	if (gfm === undefined) {
		return features;
	}
	return {
		...features,
		gfm,
	};
}
