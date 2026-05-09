# Phase 1: Dev QRL Segment Core - Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 6
**Analogs found:** 6 / 6

## File Classification

| New/Modified File               | Role              | Data Flow                                | Closest Analog                  | Match Quality |
| ------------------------------- | ----------------- | ---------------------------------------- | ------------------------------- | ------------- |
| `src/dev.ts`                    | service/utility   | request-response + cache invalidation    | `src/dev.ts`                    | exact         |
| `src/rolldown.ts`               | plugin/controller | transform + request-response             | `src/rolldown.ts`               | exact         |
| `src/vite.ts`                   | adapter/config    | request-response + event-driven boundary | `src/vite.ts`                   | exact         |
| `test/rolldown-runtime.test.ts` | test              | request-response + transform             | `test/rolldown-runtime.test.ts` | exact         |
| `test/vite-plugin.test.ts`      | test              | adapter/request-response                 | `test/vite-plugin.test.ts`      | role-match    |
| `test/helpers.ts`               | test utility      | request-response hook invocation         | `test/helpers.ts`               | exact         |

## Pattern Assignments

### `src/dev.ts` (service/utility, request-response + cache invalidation)

**Analog:** `src/dev.ts`

**Imports pattern** (lines 1-4):

```typescript
import type { TransformModule } from '@qwik.dev/optimizer';
import { dirname, relative, resolve } from 'pathe';
import { isEqual, isRelative, parsePath, withLeadingSlash } from 'ufo';
import type { QwikEnvironment } from './rolldown';
```

**Narrow server callback pattern** (lines 6-16):

```typescript
export interface QwikDevServer {
	environments?: Record<string, { transformRequest: (url: string) => Promise<unknown> }>;
	transformRequest: (url: string) => Promise<unknown>;
}

type EncodeSegment = (environment: QwikEnvironment, path: string) => string;

interface QwikDevOptions {
	dev?: boolean;
	devServer?: QwikDevServer;
}
```

**Core dev segment state pattern** (lines 21-86):

```typescript
export function createQwikDev(
	options: QwikDevOptions,
	segments: Map<string, TransformModule>,
	root: () => string | undefined,
	encode: EncodeSegment,
) {
	const parents = new Map<string, { environment: QwikEnvironment; parent: string }>();
	const enabled = () => options.dev === true;

	return {
		isEnabled: enabled,
		optimizerInput(code: string, id: string) {
			const path = pathname(id);
			return { code, path, devPath: enabled() ? getDevPath(path, root()) : undefined };
		},
		resolveId(source: string, environment: QwikEnvironment, importer: string | undefined) {
			if (isDevHandlers(source)) {
				return { id: QWIK_DEV_HANDLERS, moduleSideEffects: false };
			}
			if (!enabled()) {
				return null;
			}

			const qrl = parseDevQrl(source);
			if (!qrl) {
				return null;
			}

			const path = resolveRelative(qrl.path, importer);
			const parent = resolveRelative(qrl.parent, importer);
			const id = encode(environment, path);
			parents.set(id, { environment, parent });
			return { id, moduleSideEffects: false };
		},
		async load(id: string) {
			if (id === QWIK_DEV_HANDLERS) {
				return `export * from '${QWIK_CORE}';`;
			}
			if (!enabled()) {
				return undefined;
			}

			const key = pathname(id);
			const pending = parents.get(key);
			if (!pending) {
				return undefined;
			}

			let segment = segments.get(key);
			const server = options.devServer;
			if (!segment && server) {
				await transformDevParent(server, pending.environment, pending.parent);
				segment = segments.get(key);
			}
			return segment?.code ?? null;
		},
		recordSegment(module: TransformModule, environment: QwikEnvironment) {
			if (!enabled()) {
				return;
			}

			for (const path of devSegmentPaths(module.path, root())) {
				segments.set(encode(environment, path), module);
			}
		},
	};
}
```

**Validation/normalization pattern** (lines 93-129):

```typescript
function parseDevQrl(id: string): { parent: string; path: string } | null {
	const path = pathname(id);
	const match = /^(?<parent>.*\.[cm]?[jt]sx?)_(?<name>[^/]+)\.js$/.exec(path);
	const parent = match?.groups?.parent;
	return parent ? { parent, path } : null;
}

function resolveRelative(path: string, importer: string | undefined) {
	return importer && isRelative(path) ? resolve(dirname(pathname(importer)), path) : path;
}

function devSegmentPaths(path: string, root: string | undefined) {
	const paths = new Set([path, withLeadingSlash(path)]);
	const devPath = getDevPath(path, root);
	if (devPath) {
		paths.add(devPath);
	}
	return paths;
}

function getDevPath(id: string, root: string | undefined) {
	if (!root) {
		return undefined;
	}

	const path = relative(root, id);
	return path && path !== '..' && !isRelative(path) ? withLeadingSlash(path) : undefined;
}

function transformDevParent(server: QwikDevServer, environment: QwikEnvironment, parent: string) {
	const devEnvironment = server.environments?.[environment === 'server' ? 'ssr' : 'client'];
	return devEnvironment?.transformRequest(parent) ?? server.transformRequest(parent);
}

function pathname(id: string) {
	return parsePath(id).pathname;
}
```

**Upstream HMR accept pattern to port simply** (`/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/plugin.ts` lines 739-753):

```typescript
// In HMR mode, append self-accept code to QRL segments
// When the parent file changes, Vite invalidates and re-serves the segment.
// The custom event will ensure the re-rendering of mounted components, when non-segment files are changed.
// This is needed to propagate changes from imports that are not QRL parents, for example styles.
if (devServer?.hot && parentId && opts.devTools.hmr && segment?.ctxName !== 'worker$') {
	const parentUrl = parentId.startsWith(opts.rootDir!)
		? parentId.slice(opts.rootDir!.length)
		: parentId;
	code +=
		`\nif (import.meta.hot && typeof document !== 'undefined') {import.meta.hot.accept(()=>{` +
		`document.dispatchEvent(new CustomEvent('qHmr', {detail: {files:[${JSON.stringify(parentUrl)}], t: document.__hmrT}}));` +
		`});}`;
}

return { code, map, meta: { segment } };
```

**Upstream invalidation pattern to simplify** (`/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/plugin.ts` lines 1120-1140):

```typescript
function hotUpdate(environment: DevEnvironment, ctx: HotUpdateOptions) {
	const isServer = environment.name === 'ssr';
	debug('hotUpdate()', ctx.file, environment.name);

	const outputs = isServer ? serverTransformedOutputs : clientTransformedOutputs;

	for (const mod of ctx.modules) {
		const { id } = mod;
		if (id) {
			debug('hotUpdate()', `invalidate ${id}`);
			clientResults.delete(id);
			for (const [key, [_, parentId]] of outputs) {
				if (parentId === id) {
					debug('hotUpdate()', `invalidate ${id} segment ${key}`);
					outputs.delete(key);
					const segMod = environment.moduleGraph.getModuleById(key);
					if (segMod) {
						environment.moduleGraph.invalidateModule(segMod);
					}
				}
			}
		}
	}
}
```

---

### `src/rolldown.ts` (plugin/controller, transform + request-response)

**Analog:** `src/rolldown.ts`

**Imports pattern** (lines 1-24):

```typescript
import {
	createOptimizer,
	type Diagnostic,
	type EntryStrategy,
	type OptimizerOptions,
	type SegmentAnalysis,
	type TransformModule,
} from '@qwik.dev/optimizer';
import { dirname, normalize, resolve } from 'pathe';
import type { Plugin, RolldownError } from 'rolldown';
import { isRelative, parsePath } from 'ufo';
import { outputDefaults, Q_BUNDLE_GRAPH, Q_BUILD_PREFIX, QWIK_BUILD } from './build/chunking';
import { injectQwikPreloaderTags } from './build/static-html';
import { createQwikDev, type QwikDevServer } from './dev';
import { defineQwik, replaceExperimental } from './features';
import {
	createManifest,
	injectManifest,
	Q_MANIFEST_FILE,
	QWIK_MANIFEST,
	type QwikManifest,
	type ServerQwikManifest,
} from './build/manifest';
import { qwikExternal } from './qwik-external';
```

**Option/type pattern** (lines 26-37):

```typescript
export type QwikEnvironment = 'client' | 'server' | 'lib';

export interface QwikRolldownOptions {
	dev?: boolean;
	devServer?: QwikDevServer;
	entryStrategy?: EntryStrategy;
	experimental?: string[];
	manifestInput?: QwikManifest | ServerQwikManifest;
	onManifest?: (manifest: QwikManifest) => void;
	optimizerOptions?: OptimizerOptions;
	rootDir?: string;
}
```

**Plugin state and dev helper pattern** (lines 60-96):

```typescript
export function plugin(environment: Environment, options: QwikRolldownOptions = {}): Plugin {
	const segments = new Map<string, TransformModule>();
	const symbols = new Map<string, SegmentAnalysis>();
	// TODO: Remove this Qwik library noExternal workaround after https://github.com/QwikDev/qwik-evolution/discussions/318.
	const external = qwikExternal();
	let manifest: QwikManifest | ServerQwikManifest | null = null;
	let optimizer: ReturnType<typeof createOptimizer> | undefined;
	let root = options.rootDir;
	let handlers = false;
	let missingManifestWarned = false;
	let name = 'qwik:rolldown';

	if (typeof environment === 'string') {
		name = `qwik:rolldown:${environment}`;
	}

	function getOptimizer() {
		if (!optimizer) {
			optimizer = createOptimizer(options.optimizerOptions);
		}

		return optimizer;
	}

	function getEnvironment(context: unknown) {
		if (typeof environment === 'function') {
			return environment(context);
		}

		return environment;
	}

	function getRoot() {
		return root ?? options.rootDir;
	}
	const dev = createQwikDev(options, segments, getRoot, segmentId);
```

**Resolve/load delegation pattern** (lines 131-223):

```typescript
async resolveId(source, importer) {
	const currentEnvironment = getEnvironment(this);
	const devResolution = dev.resolveId(
		source,
		currentEnvironment,
		sourceImporter(importer),
	);
	if (devResolution) return devResolution;

	if (source === QWIK_BUILD) {
		return QWIK_BUILD;
	}

	if (source.startsWith(SEGMENT)) {
		return source;
	}
	// ...external and production segment resolution omitted...
},
async load(id) {
	if (id === QWIK_BUILD) {
		const server = getEnvironment(this) === 'server';
		const isDev = dev.isEnabled();
		return `globalThis.qDev=${isDev};export const isServer=${server};export const isBrowser=${!server};export const isDev=${isDev};`;
	}

	const devCode = await dev.load(id);
	if (devCode !== undefined) return devCode;

	const segment = segments.get(pathname(id));
	if (!segment) {
		return null;
	}

	return segment.code;
},
```

**Optimizer transform + record segments pattern** (lines 290-328):

```typescript
async function transform(
	code: string,
	id: string,
	context: TransformContext,
	currentEnvironment: QwikEnvironment,
) {
	const result = await (
		await getOptimizer()
	).transformModules({
		input: [dev.optimizerInput(code, id)],
		entryStrategy: entryStrategy(currentEnvironment, options.entryStrategy),
		minify: 'simplify',
		sourceMaps: dev.isEnabled(),
		transpileTs: true,
		transpileJsx: true,
		explicitExtensions: true,
		preserveFilenames: true,
		srcDir: getRoot() ?? '',
		rootDir: getRoot(),
		mode: currentEnvironment === 'lib' ? 'lib' : dev.isEnabled() ? 'dev' : 'prod',
		isServer: currentEnvironment === 'server',
	});
	reportDiagnostics(result.diagnostics, id, context);

	for (const module of result.modules) {
		if (!module.segment) {
			continue;
		}

		const id = segmentId(currentEnvironment, module.path);
		segments.set(id, module);
		dev.recordSegment(module, currentEnvironment);
		if (currentEnvironment === 'client') {
			symbols.set(module.segment.name, module.segment);
			if (!dev.isEnabled()) {
				context.emitFile({ type: 'chunk', id });
			}
		}
	}
```

**Error handling pattern** (lines 348-371):

```typescript
function reportDiagnostics(diagnostics: Diagnostic[], id: string, context: TransformContext) {
	for (const diagnostic of diagnostics) {
		const loc = diagnostic.highlights?.[0];
		const error = Object.assign(createPluginError(id, diagnostic.message), {
			loc: loc && {
				column: loc.startCol,
				line: loc.startLine,
			},
		});
		if (diagnostic.category === 'error') {
			context.error(error);
		} else {
			context.warn(error);
		}
	}
}

function createPluginError(id: string, message: string): RolldownError {
	return Object.assign(new Error(message), {
		id,
		plugin: 'qwik',
		stack: '',
	});
}
```

**Environment-scoped segment ID pattern** (lines 389-399):

```typescript
function segmentId(environment: QwikEnvironment, path: string) {
	return `${SEGMENT}${environment}:${path}`;
}

function sourceImporter(id: string | undefined) {
	if (!id?.startsWith(SEGMENT)) {
		return id;
	}

	const index = id.indexOf(':', SEGMENT.length);
	return index < 0 ? id : id.slice(index + 1);
}
```

---

### `src/vite.ts` (adapter/config, request-response + event-driven boundary)

**Analog:** `src/vite.ts`

**Imports and adapter option pattern** (lines 1-8):

```typescript
import type { OutputOptions } from 'rolldown';
import type { ConfigEnv, Plugin, UserConfig, ViteDevServer } from 'vite';
import { outputDefaults } from './build/chunking';
import type { QwikManifest } from './build/manifest';
import { plugin as qwikRolldown, type QwikEnvironment, type QwikRolldownOptions } from './rolldown';
import { qwikViteExternal } from './qwik-external';

export interface VitePluginOptions extends QwikRolldownOptions {}
```

**Vite adapter boundary pattern** (lines 12-40):

```typescript
export function qwik(options: VitePluginOptions = {}): Plugin[] {
	const rolldownOptions = { ...options };
	// TODO: Remove this Qwik library noExternal workaround after https://github.com/QwikDev/qwik-evolution/discussions/318.
	const external = qwikViteExternal(setQwikConfigDefaults);
	let manifest: QwikManifest | null = null;
	rolldownOptions.onManifest = (nextManifest) => {
		manifest = nextManifest;
		options.onManifest?.(nextManifest);
	};
	const basePlugin = qwikRolldown(getBuildEnvironment, rolldownOptions) as Plugin;

	const qwikPlugin = {
		...basePlugin,
		name: 'vite-plugin-qwik',
		enforce: 'pre',
		api: {
			getManifest: () => manifest,
		},
		...external,
		configResolved(resolvedConfig) {
			rolldownOptions.dev = resolvedConfig.command === 'serve';
			rolldownOptions.rootDir = resolvedConfig.root;
		},
		configureServer(server: ViteDevServer) {
			rolldownOptions.devServer = server;
		},
	} satisfies Plugin & { api: { getManifest: () => QwikManifest | null } };

	return [qwikPlugin];
}
```

**Environment detection pattern** (lines 70-95):

```typescript
type ViteHookContext = {
	environment?: {
		config?: {
			consumer?: 'client' | 'server';
			build?: { lib?: unknown };
		};
	};
};

function getBuildEnvironment(context: unknown): QwikEnvironment {
	const pluginContext = context as ViteHookContext;
	const config = pluginContext.environment?.config;
	if (!config) {
		return 'client';
	}

	if (config.build?.lib) {
		return 'lib';
	}

	if (config.consumer === 'server') {
		return 'server';
	}

	return 'client';
}
```

---

### `test/rolldown-runtime.test.ts` (test, request-response + transform)

**Analog:** `test/rolldown-runtime.test.ts`

**Imports and optimizer mock pattern** (lines 1-13):

```typescript
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { qwikClient, qwikLib, qwikServer } from '../src/rolldown';
import { callBuildStart, callLoad, callOptions, callResolveId, callTransform } from './helpers';

const optimizerMock = vi.hoisted(() => ({
	createOptimizer: vi.fn(),
	transformModules: vi.fn(),
}));

vi.mock('@qwik.dev/optimizer', () => ({
	createOptimizer: optimizerMock.createOptimizer,
}));
```

**Mock reset/default transform pattern** (lines 14-36):

```typescript
beforeEach(() => {
	optimizerMock.createOptimizer.mockReset();
	optimizerMock.transformModules.mockReset();
	optimizerMock.transformModules.mockResolvedValue({
		modules: [
			{
				path: './src/root.tsx',
				isEntry: false,
				code: 'optimized',
				map: null,
				segment: null,
				origPath: null,
			},
		],
		diagnostics: [],
		isTypeScript: true,
		isJsx: true,
	});
	optimizerMock.createOptimizer.mockResolvedValue({
		transformModules: optimizerMock.transformModules,
		sys: {} as never,
	});
});
```

**Dev path test pattern** (lines 169-187):

```typescript
test('uses dev optimizer mode and root-relative dev paths in dev mode', async () => {
	const plugin = qwikClient({ dev: true });

	callBuildStart(plugin, { cwd: '/workspace/app' });
	await callTransform(plugin, 'export const answer = 42;', '/workspace/app/src/root.tsx');

	expect(optimizerMock.transformModules).toHaveBeenCalledWith(
		expect.objectContaining({
			input: [
				expect.objectContaining({
					devPath: '/src/root.tsx',
					path: '/workspace/app/src/root.tsx',
				}),
			],
			mode: 'dev',
			sourceMaps: true,
		}),
	);
});
```

**Dev QRL resolve/load test pattern** (lines 189-220):

```typescript
test('serves dev QRL segment URLs from transformed output', async () => {
	optimizerMock.transformModules.mockResolvedValueOnce({
		modules: [
			{
				path: '/workspace/app/src/home.tsx',
				isEntry: false,
				code: 'parent',
				map: null,
				segment: null,
				origPath: null,
			},
			{
				path: '/src/home.tsx_click_abc.js',
				isEntry: false,
				code: 'segment',
				map: null,
				segment: { name: 's_abc' },
				origPath: null,
			},
		],
		diagnostics: [],
		isTypeScript: true,
		isJsx: true,
	});
	const plugin = qwikClient({ dev: true });

	callBuildStart(plugin, { cwd: '/workspace/app' });
	await callTransform(plugin, 'export default 1;', '/workspace/app/src/home.tsx');
	const resolved = await callResolveId(plugin, '/src/home.tsx_click_abc.js');

	expect(await callLoad(plugin, (resolved as { id: string }).id)).toBe('segment');
});
```

**Parent transform callback test pattern** (lines 222-233):

```typescript
test('transforms dev QRL parents on demand', async () => {
	const transformRequest = vi.fn().mockResolvedValue(null);
	const plugin = qwikClient({
		dev: true,
		devServer: { environments: { client: { transformRequest } }, transformRequest },
	});

	const resolved = await callResolveId(plugin, '/src/home.tsx_click_abc.js');
	await callLoad(plugin, (resolved as { id: string }).id);

	expect(transformRequest).toHaveBeenCalledWith('/src/home.tsx');
});
```

**Relative segment importer test pattern** (lines 235-248):

```typescript
test('resolves relative dev QRLs against their source importer', async () => {
	const plugin = qwikClient({ dev: true });

	const resolved = await callResolveId(
		plugin,
		'./home.tsx_home_component_abc.js',
		'\0qwik:segment:client:/workspace/app/src/root.tsx_root_component_def.js',
	);

	expect(resolved).toEqual({
		id: '\0qwik:segment:client:/workspace/app/src/home.tsx_home_component_abc.js',
		moduleSideEffects: false,
	});
});
```

**Upstream tests for accept-code behavior** (`/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/plugin.unit.ts` lines 305-336 and 389-420):

```typescript
test('load skips HMR wrapper for worker$ segments', async () => {
	// ...transform worker$ source...
	const loaded = await plugin.load({} as any, segmentId);
	expect((loaded as { code: string }).code).not.toContain(
		"document.dispatchEvent(new CustomEvent('qHmr'",
	);
	expect((loaded as { code: string }).code).not.toContain("typeof document !== 'undefined'");
});

test('load wraps non-worker QRL segment HMR with a runtime document guard', async () => {
	// ...transform component$ source...
	const loaded = await plugin.load({} as any, eventSegmentId!);
	expect((loaded as { code: string }).code).toContain(
		"if (import.meta.hot && typeof document !== 'undefined')",
	);
});
```

---

### `test/vite-plugin.test.ts` (test, adapter/request-response)

**Analog:** `test/vite-plugin.test.ts`

**Imports and helper use pattern** (lines 1-13):

```typescript
import { createOptimizer } from '@qwik.dev/optimizer';
import type { Plugin } from 'vite';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { QwikManifest } from '../src/build/manifest';
import { qwik } from '../src/vite';
import {
	callConfigResolved,
	callLoad,
	callResolveId,
	callTransform,
	createViteHookContext,
	getPlugin,
} from './helpers';
```

**Vite root config test pattern** (lines 60-86):

```typescript
test('uses Vite config root for optimizer paths', async () => {
	const plugin = getQwikPlugin();

	callConfigResolved(plugin, {
		root: '/workspace/app',
		build: {
			rolldownOptions: { input: 'src/root.tsx' },
			rollupOptions: {},
		},
	});
	const result = await callTransform(
		plugin,
		'export default 1;',
		'/workspace/app/src/root.tsx',
		createViteHookContext(),
	);

	expect(createOptimizer).toHaveBeenCalledWith(undefined);
	expect(optimizerMock.transformModules).toHaveBeenCalledWith(
		expect.objectContaining({
			rootDir: '/workspace/app',
			srcDir: '/workspace/app',
			isServer: false,
		}),
	);
	expect(result).toEqual({ code: 'optimized', map: null });
});
```

**Server environment context test pattern** (lines 88-112):

```typescript
test('uses Vite SSR transform context for server transforms', async () => {
	const plugin = getQwikPlugin();

	callConfigResolved(plugin, {
		root: '/workspace/app',
		build: {
			rolldownOptions: { input: 'src/root.tsx' },
			rollupOptions: {},
		},
	});
	await callTransform(
		plugin,
		'export default 1;',
		'/workspace/app/src/root.tsx',
		createViteHookContext('server'),
	);

	expect(optimizerMock.transformModules).toHaveBeenCalledWith(
		expect.objectContaining({
			isServer: true,
			mode: 'prod',
			entryStrategy: { type: 'hoist' },
		}),
	);
});
```

**Vite segment resolve/load test pattern** (lines 177-215):

```typescript
const plugin = getQwikPlugin();
callConfigResolved(plugin, {
	root: '/workspace/app',
	build: {
		rolldownOptions: { input: 'src/root.tsx' },
		rollupOptions: {},
	},
});
await callTransform(plugin, 'source', '/workspace/app/src/root.tsx', createViteHookContext());

const resolvedId = await callResolveId(
	plugin,
	'./root.tsx_root_component_abc.js',
	'/workspace/app/src/root.tsx',
	createViteHookContext(),
);

expect(typeof resolvedId).toBe('string');
expect(await callLoad(plugin, resolvedId as string, createViteHookContext())).toBe(
	'export const s_abc = () => "Hello";',
);
```

---

### `test/helpers.ts` (test utility, request-response hook invocation)

**Analog:** `test/helpers.ts`

**Hook type and context pattern** (lines 1-25):

```typescript
import type { EnvironmentOptions, Plugin as VitePlugin, ResolvedConfig, UserConfig } from 'vite';
import { vi } from 'vitest';

type FunctionHook = (this: unknown, ...args: unknown[]) => unknown;
type PluginHooks = {
	buildStart?: unknown;
	config?: unknown;
	configEnvironment?: unknown;
	configResolved?: unknown;
	generateBundle?: unknown;
	load?: unknown;
	options?: unknown;
	outputOptions?: unknown;
	resolveId?: unknown;
	transform?: unknown;
};
type MockFn = ReturnType<typeof vi.fn>;

export type HookContext = {
	emitFile?: MockFn;
	error?: MockFn;
	resolve?: MockFn;
	warn?: MockFn;
	[key: string]: unknown;
};
```

**Transform/resolve/load hook invocation pattern** (lines 51-93):

```typescript
export function callTransform(
	plugin: PluginHooks,
	code: string,
	id: string,
	context: HookContext = {},
) {
	return getHook(plugin.transform, 'transform').call(
		{
			emitFile: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			...context,
		},
		code,
		id,
		undefined,
	);
}

export function callResolveId(
	plugin: PluginHooks,
	source: string,
	importer?: string,
	context: HookContext = {},
) {
	return getHook(plugin.resolveId, 'resolveId').call(
		{
			emitFile: vi.fn(),
			error: vi.fn((value: unknown) => {
				throw value instanceof Error ? value : new Error(String(value));
			}),
			resolve: vi.fn(),
			...context,
		},
		source,
		importer,
		{ isEntry: false },
	);
}

export function callLoad(plugin: PluginHooks, id: string, context: HookContext = {}) {
	return getHook(plugin.load, 'load').call(context, id, undefined);
}
```

**Vite environment context helper pattern** (lines 119-128):

```typescript
export function createViteHookContext(
	consumer: 'client' | 'server' = 'client',
	build: { lib?: unknown } = {},
): HookContext {
	return {
		environment: { config: { consumer, build } },
		emitFile: vi.fn(),
		resolve: vi.fn(),
	};
}
```

## Shared Patterns

### Environment-scoped segment identity

**Source:** `src/rolldown.ts` lines 50 and 389-390  
**Apply to:** `src/dev.ts`, `src/rolldown.ts`, dev segment tests

```typescript
const SEGMENT = '\0qwik:segment:';

function segmentId(environment: QwikEnvironment, path: string) {
	return `${SEGMENT}${environment}:${path}`;
}
```

### Narrow Vite dev server callback

**Source:** `src/dev.ts` lines 6-8 and 122-124  
**Apply to:** lazy parent transform and environment-isolation tests

```typescript
export interface QwikDevServer {
	environments?: Record<string, { transformRequest: (url: string) => Promise<unknown> }>;
	transformRequest: (url: string) => Promise<unknown>;
}

function transformDevParent(server: QwikDevServer, environment: QwikEnvironment, parent: string) {
	const devEnvironment = server.environments?.[environment === 'server' ? 'ssr' : 'client'];
	return devEnvironment?.transformRequest(parent) ?? server.transformRequest(parent);
}
```

### URL/source normalization

**Source:** `src/dev.ts` lines 93-129  
**Apply to:** QRL parse, query/hash stripping, absolute/root-relative/platform path tests

```typescript
function parseDevQrl(id: string): { parent: string; path: string } | null {
	const path = pathname(id);
	const match = /^(?<parent>.*\.[cm]?[jt]sx?)_(?<name>[^/]+)\.js$/.exec(path);
	const parent = match?.groups?.parent;
	return parent ? { parent, path } : null;
}

function pathname(id: string) {
	return parsePath(id).pathname;
}
```

### Nullable hook returns for unhandled modules

**Source:** `src/dev.ts` lines 40-47, 59-67 and `src/rolldown.ts` lines 214-220  
**Apply to:** all resolve/load changes

```typescript
if (!enabled()) {
	return null;
}

const qrl = parseDevQrl(source);
if (!qrl) {
	return null;
}

const devCode = await dev.load(id);
if (devCode !== undefined) return devCode;

const segment = segments.get(pathname(id));
if (!segment) {
	return null;
}
```

### Test hook harness

**Source:** `test/helpers.ts` lines 51-93  
**Apply to:** new tests in `test/rolldown-runtime.test.ts` and `test/vite-plugin.test.ts`

```typescript
export function callTransform(
	plugin: PluginHooks,
	code: string,
	id: string,
	context: HookContext = {},
) {
	return getHook(plugin.transform, 'transform').call(
		{
			emitFile: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			...context,
		},
		code,
		id,
		undefined,
	);
}
```

## No Analog Found

No Phase 1 files lack a local analog. If planning considers a new `src/hmr.ts`, treat it as Phase 2-owned unless only a tiny shared accept-code helper is proven necessary by tests; the closest behavior reference is upstream `plugin.ts` lines 739-753, not an existing local module.

| File | Role | Data Flow | Reason                                                                  |
| ---- | ---- | --------- | ----------------------------------------------------------------------- |
| —    | —    | —         | All inferred Phase 1 files are modifications to existing modules/tests. |

## Metadata

**Analog search scope:** `src/**/*.ts`, `test/**/*.ts`, upstream Qwik Vite plugin excerpts required by `AGENTS.md`  
**Files scanned:** 14 local files plus 2 upstream reference files  
**Pattern extraction date:** 2026-05-09
