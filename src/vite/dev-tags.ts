import { joinURL } from 'ufo';
import type { GlobalInjections } from '../types.ts';
import { QWIK_HMR_BRIDGE_PATH } from './hmr.ts';

/**
 * Dev tags are the <script>/<link> tags server-rendered HTML needs during development. Qwik SSR
 * renders them itself through the dev server manifest (see `devTagsManifest`), so they work in
 * any runtime — Node, workerd, or Deno — without rewriting HTML, and streaming SSR stays intact.
 *
 * The Qwik plugin contributes the tags below; frameworks add theirs through
 * `api.registerDevInjection` (Qwik Router registers its dev stylesheet tags this way).
 */
export function createDevTags() {
	const tags: GlobalInjections[] = [];
	let viteTagsAdded = false;

	return {
		tags,
		register(tag: GlobalInjections) {
			tags.push(tag);
		},
		registerViteTags(base: string, hmrEnabled: boolean) {
			if (viteTagsAdded) {
				return;
			}
			viteTagsAdded = true;
			const viteTags = [headScript(base, '/@vite/client')];
			if (hmrEnabled) {
				viteTags.push(headScript(base, QWIK_HMR_BRIDGE_PATH));
			}
			tags.unshift(...viteTags);
		},
	};
}

export function headScript(base: string, src: string): GlobalInjections {
	return {
		tag: 'script',
		location: 'head',
		attributes: { type: 'module', src: joinURL(base, src) },
	};
}

export function headStylesheet(base: string, href: string): GlobalInjections {
	return {
		tag: 'link',
		location: 'head',
		attributes: { rel: 'stylesheet', href: joinURL(base, href) },
	};
}
