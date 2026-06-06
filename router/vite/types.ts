import type { EnvironmentModuleNode, Plugin } from 'vite';
import type { MdxCompileOptions } from 'satteri';
import type { BundleGraphAdder, QwikOptimizerStripNames } from '../../src/types.ts';
import type { RouterPreviewOptions } from './preview.ts';

export interface QwikRouterVitePluginOptions {
	/** Client build input to use when the host has not supplied one. Defaults to `src/root.tsx`. */
	clientInput?: string | string[] | Record<string, string>;
	/** Lightweight MDX compile options supported by the Satteri route transform. */
	mdx?: RouterMdxOptions;
	/** Environment name used for the client build. Defaults to `client`. */
	clientEnvironment?: string;
	/** Directory containing Qwik Router routes. Defaults to `src/routes`. */
	routesDir?: string;
	/**
	 * @deprecated Use `mdx.gfm` and `mdx.autolinkHeadings` instead.
	 */
	mdxPlugins?: RouterMdxPlugins;
	/** Directory containing Qwik Router server plugins. Defaults to `routesDir`. */
	serverPluginsDir?: string;
	/** Use static route imports in generated router config. Defaults to dynamic imports. */
	staticImportRoutes?: boolean;
	/** Configure Vite preview to serve the built SSR preview entry. */
	preview?: RouterPreviewOptions | false;
	/** Enable router-owned dev SSR middleware. Defaults to `true`. */
	devSsrServer?: boolean;
	/** Dev server environment used for fetch-based SSR. Defaults to `ssr`. */
	serverEnvironment?: string;
	/** Match Qwik Router's trailing slash define. Defaults to `true`. */
	trailingSlash?: boolean;
	/** Match Qwik Router's loader serialization define. Defaults to `never`. */
	defaultLoadersSerializationStrategy?: string;
	/** Platform data passed to the dev middleware's Qwik Router adapter. */
	platform?: Record<string, unknown>;
	/** Server function virtual-module options for non-router hosts. */
	serverFunctions?: RouterServerFunctionsOptions;
}

export type QwikCityVitePluginOptions = QwikRouterVitePluginOptions;

/** @deprecated Use `mdx.gfm` and `mdx.autolinkHeadings` instead. */
export interface RouterMdxPlugins {
	/** Enable Satteri GFM parsing. Defaults to `true`. */
	remarkGfm?: boolean;
	/** Accepted for upstream option compatibility; syntax highlighting should be user-provided. */
	rehypeSyntaxHighlight?: boolean;
	/** Add heading anchor links. Defaults to `true`. */
	rehypeAutolinkHeadings?: boolean;
}

/** @deprecated Use Satteri-native MDX behavior instead of unified remark/rehype plugins. */
export type RouterLegacyMdxPlugin =
	| ((...options: any[]) => unknown)
	| string
	| readonly [(...options: any[]) => unknown, ...unknown[]]
	| readonly [string, ...unknown[]];

export type RouterMdxOptions = Omit<
	MdxCompileOptions,
	'elementAttributeNameCase' | 'filename' | 'jsxImportSource'
> & {
	/** Enable GFM parsing. Defaults to `true`. */
	gfm?: boolean;
	/** Add heading anchor links. Defaults to `true`. */
	autolinkHeadings?: boolean;
	/**
	 * @deprecated Unified rehype plugin compatibility. This uses the legacy JavaScript
	 * MDX pipeline instead of Satteri. Prefer built-in MDX options for new code.
	 */
	rehypePlugins?: readonly RouterLegacyMdxPlugin[];
	/**
	 * @deprecated Unified remark plugin compatibility. This uses the legacy JavaScript
	 * MDX pipeline instead of Satteri. Prefer built-in MDX options for new code.
	 */
	remarkPlugins?: readonly RouterLegacyMdxPlugin[];
};

export type RouterServerFunctionsOptions = {
	/** Public virtual module id that SSR code can import for registration side effects. */
	virtualId?: string;
};

export interface BuiltRouterRoute {
	id: string;
	filePath: string;
	pathname: string;
	routeName: string;
	layouts: BuiltRouterLayout[];
}

export interface BuiltRouterLayout {
	id: string;
	filePath: string;
	pathname: string;
}

export interface QwikRouterPluginApi {
	getBasePathname: () => string;
	getRoutes: () => BuiltRouterRoute[];
	getServiceWorkers: () => [];
}

export type QwikRouterPlugin = Plugin & {
	name: 'vite-plugin-qwik-router';
	api: QwikRouterPluginApi;
};

export type RouterState = {
	base: string;
	dirty: boolean;
	dynamicImports: boolean;
	layouts: BuiltRouterLayout[];
	rootDir: string;
	routes: BuiltRouterRoute[];
	routesDir: string;
	serverPlugins: string[];
	serverPluginsDir: string;
};

export type RouterBuildOptions = {
	rolldownOptions?: { input?: unknown };
};

export type QwikVitePluginApiHost = Plugin & {
	api?: {
		registerBundleGraphAdder?: (adder: BundleGraphAdder) => void;
		registerOptimizerStripNames?: (names: QwikOptimizerStripNames) => void;
	};
};

export type RouterDevRequestOptions = Pick<
	QwikRouterVitePluginOptions,
	'platform' | 'serverEnvironment'
>;

export type ConnectRequest = Parameters<import('vite').Connect.NextHandleFunction>[0];
export type ConnectResponse = Parameters<import('vite').Connect.NextHandleFunction>[1];
export type ConnectNext = (error?: unknown) => void;

export type DevSsrEntry = {
	default?: (options: unknown) => unknown;
};

export type RequestHandlerModule = {
	mergeHeadersCookies: (headers: Headers, cookies: unknown) => Headers;
	requestHandler: (
		serverRequestEv: RouterServerRequestEvent<Response>,
		opts: { render: (options: unknown) => unknown },
	) => Promise<QwikRouterRun<Response> | null>;
};

export type RouterServerRequestEvent<T> = {
	mode: 'server';
	url: URL;
	locale: string | undefined;
	platform: Record<string, unknown>;
	request: Request;
	env: { get(key: string): string | undefined };
	getClientConn: () => Record<string, unknown>;
	getWritableStream: (
		status: number,
		headers: Headers,
		cookies: unknown,
		resolve: (response: T) => void,
		requestEv: unknown,
	) => WritableStream<Uint8Array>;
};

export type QwikRouterRun<T> = {
	completion: Promise<unknown>;
	response: Promise<T | null>;
};

export type EnvironmentModuleGraphLike = {
	idToModuleMap: Map<string, EnvironmentModuleNode>;
};
