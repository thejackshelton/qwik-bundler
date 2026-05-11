# Phase 2: Vite HMR Transport and Browser Bridge - Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 7 likely new/modified files
**Analogs found:** 7 / 7

## File Classification

| New/Modified File                                     | Role                   | Data Flow                             | Closest Analog                                                    | Match Quality |
| ----------------------------------------------------- | ---------------------- | ------------------------------------- | ----------------------------------------------------------------- | ------------- |
| `src/vite.ts`                                         | adapter/plugin         | event-driven + request-response       | `src/vite.ts` + upstream `packages/qwik-vite/src/plugins/vite.ts` | exact         |
| `src/vite/hmr.ts`                                     | service/plugin helper  | event-driven                          | upstream `packages/qwik-vite/src/plugins/vite.ts` and `plugin.ts` | role-match    |
| `src/client/hmr-bridge.ts`                            | client runtime utility | event-driven                          | upstream `packages/qwik-vite/src/plugins/vite.ts`                 | exact         |
| `src/dev.ts`                                          | service/utility        | transform + event-driven invalidation | `src/dev.ts` + upstream `plugin.ts`                               | exact         |
| `src/rolldown.ts`                                     | bundler plugin         | transform + event-driven invalidation | `src/rolldown.ts`                                                 | exact         |
| `test/helpers.ts`                                     | test utility           | request-response hook invocation      | `test/helpers.ts`                                                 | exact         |
| `test/vite-plugin.test.ts` or `test/vite-hmr.test.ts` | test                   | event-driven + request-response       | `test/vite-plugin.test.ts` + `test/rolldown-runtime.test.ts`      | role-match    |

## Pattern Assignments

### `src/vite.ts` (adapter/plugin, event-driven + request-response)

**Analog:** `src/vite.ts` with upstream reference `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/vite.ts`

**Imports/options pattern** (`src/vite.ts` lines 1-8):

```typescript
import type { OutputOptions } from 'rolldown';
import type { ConfigEnv, Plugin, UserConfig, ViteDevServer } from 'vite';
import { outputDefaults } from './build/chunking';
import type { QwikManifest } from './build/manifest';
import { plugin as qwikRolldown, type QwikEnvironment, type QwikRolldownOptions } from './rolldown';
import { qwikViteExternal } from './qwik-external';

export interface VitePluginOptions extends QwikRolldownOptions {}
```

**Plugin composition pattern** (`src/vite.ts` lines 12-40):

```typescript
export function qwik(options: VitePluginOptions = {}): Plugin[] {
	const rolldownOptions = { ...options };
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

**Upstream transformIndexHtml/hotUpdate placement** (`qwik-vite/src/plugins/vite.ts` lines 654-715):

```typescript
transformIndexHtml() {
  // only in dev mode
  if (viteCommand !== 'serve') {
    return;
  }
  return getViteIndexTags(qwikPlugin.getOptions(), basePathname);
},
configureServer(server: ViteDevServer) {
  viteServer = server;
  qwikPlugin.configureServer(server);
},

hotUpdate(ctx) {
  qwikPlugin.hotUpdate(this.environment, ctx);

  const hmrEnabled = qwikViteOpts?.devTools?.hmr ?? true;
  if (this.environment.name === 'ssr' && ctx.modules.length) {
    if (hmrEnabled) {
      const files = new Set<string>();
      const isSourceUrl = (url: string) => /\.([mc]?[jt]sx?|mdx?)$/.test(url.split('?')[0]);
      // collect source URLs or JS source importers
      if (files.size > 0 && viteServer) {
        viteServer.environments.client.hot.send({
          type: 'custom',
          event: 'qwik:hmr',
          data: { files: [...files], t: ctx.timestamp },
        });
      }
    } else {
      viteServer?.environments.client.hot.send({ type: 'full-reload' });
    }
  }
},
```

**Apply:** keep `src/vite.ts` thin. Compose any new `createViteHmr(...)` helper from this file rather than embedding browser bridge strings and module traversal inline.

---

### `src/vite/hmr.ts` (service/plugin helper, event-driven)

**Analog:** upstream `qwik-vite/src/plugins/vite.ts` and `qwik-vite/src/plugins/plugin.ts`

**Virtual bridge ID/code source** (`qwik-vite/src/plugins/vite.ts` lines 67-97):

```typescript
const QWIK_HMR_BRIDGE_ID = '@qwik-hmr-bridge';
const QWIK_HMR_BRIDGE_CODE = `
  if (import.meta.hot) {
    let timeout;
    import.meta.hot.on("qwik:hmr", (data) => {
      if (data.t === document.__hmrT) {
        return;
      }
      clearTimeout(timeout);
      document.__hmrT = data.t;
      document.__hmrDone = 0;
      document.dispatchEvent(
        new CustomEvent("qHmr", { detail: data })
      );
      timeout = setTimeout(() => {
        if (document.__hmrDone !== document.__hmrT) {
          location.reload();
        }
      }, 500);
    });
  }
`;
```

**Segment invalidation source** (`qwik-vite/src/plugins/plugin.ts` lines 1119-1143):

```typescript
function hotUpdate(environment: DevEnvironment, ctx: HotUpdateOptions) {
	const isServer = environment.name === 'ssr';
	const outputs = isServer ? serverTransformedOutputs : clientTransformedOutputs;

	for (const mod of ctx.modules) {
		const { id } = mod;
		if (id) {
			clientResults.delete(id);
			for (const [key, [_, parentId]] of outputs) {
				if (parentId === id) {
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

**Local invalidation API to call** (`src/rolldown.ts` lines 98-101):

```typescript
return {
	api: {
		invalidateDevSegments: dev.invalidate,
	},
```

**SSR-to-client forwarding pattern** (`qwik-vite/src/plugins/vite.ts` lines 690-709):

```typescript
const files = new Set<string>();
const isSourceUrl = (url: string) => /\.([mc]?[jt]sx?|mdx?)$/.test(url.split('?')[0]);
for (const m of ctx.modules) {
	const url = m.url.split('?')[0];
	if (m.type === 'js' && isSourceUrl(m.url)) {
		files.add(url);
	} else {
		for (const importer of m.importers) {
			if (importer.type === 'js' && isSourceUrl(importer.url)) {
				files.add(importer.url.split('?')[0]);
			}
		}
	}
}
if (files.size > 0 && viteServer) {
	viteServer.environments.client.hot.send({
		type: 'custom',
		event: 'qwik:hmr',
		data: { files: [...files], t: ctx.timestamp },
	});
}
```

**Apply:** expose helper functions that `src/vite.ts` can delegate to: resolve/load bridge virtual module, return HTML tag for bridge, handle `hotUpdate(ctx, this.environment)`, invalidate generated segment ids through `basePlugin.api.invalidateDevSegments`, invalidate Vite module graph nodes, and send either custom `qwik:hmr` or `{ type: 'full-reload' }`.

---

### `src/client/hmr-bridge.ts` (client runtime utility, event-driven)

**Analog:** upstream bridge string in `qwik-vite/src/plugins/vite.ts`

**Core browser bridge pattern** (`qwik-vite/src/plugins/vite.ts` lines 73-97):

```typescript
const QWIK_HMR_BRIDGE_CODE = `
  // HMR bridge: connects Vite HMR events to Qwik's component re-rendering.
  if (import.meta.hot) {
    let timeout;
    import.meta.hot.on("qwik:hmr", (data) => {
      if (data.t === document.__hmrT) {
        console.log("Received duplicate HMR update, ignoring", data.files);
        return;
      }
      clearTimeout(timeout);
      document.__hmrT = data.t;
      document.__hmrDone = 0;
      document.dispatchEvent(
        new CustomEvent("qHmr", { detail: data })
      );
      timeout = setTimeout(() => {
        if (document.__hmrDone !== document.__hmrT) {
          location.reload();
        }
      }, 500);
    });
  }
`;
```

**Local generated segment self-accept pattern to keep compatible with bridge state** (`src/dev.ts` lines 186-197):

```typescript
function appendSegmentAccept(
	code: string,
	module: TransformModule,
	parent: string,
	hmrEnabled: boolean,
) {
	if (!hmrEnabled || module.segment?.ctxName === 'worker$') {
		return code;
	}

	return `${code}\nif (import.meta.hot && typeof document !== 'undefined') {import.meta.hot.accept(()=>{document.dispatchEvent(new CustomEvent('qHmr',{detail:{files:[${JSON.stringify(parent)}],t:document.__hmrT}}));});}`;
}
```

**Apply:** if implemented as a real TS module, keep it browser-only: no Node imports, no source-file scanning, no Vite server references. Export or inline-load its compiled/source text through the virtual module loader. Keep payload contract `{ files: string[]; t: number }`, dedupe by `document.__hmrT`, set `document.__hmrDone = 0`, dispatch `qHmr`, and reload after the fallback window if Qwik does not acknowledge.

---

### `src/dev.ts` (service/utility, transform + event-driven invalidation)

**Analog:** `src/dev.ts`

**Narrow dev server boundary** (`src/dev.ts` lines 6-17):

```typescript
export interface QwikDevServer {
	environments?: Record<string, { transformRequest: (url: string) => Promise<unknown> }>;
	transformRequest: (url: string) => Promise<unknown>;
}

interface QwikDevOptions {
	dev?: boolean;
	devServer?: QwikDevServer;
	hmr?: boolean;
}
```

**HMR gating pattern** (`src/dev.ts` lines 28-32):

```typescript
const parents = new Map<string, { environment: QwikEnvironment; parent: string }>();
const parentSegments = new Map<string, Set<string>>();
const enabled = () => options.dev === true;
const hmrEnabled = () => enabled() && options.hmr !== false;
```

**Parent invalidation pattern** (`src/dev.ts` lines 108-130):

```typescript
invalidate(parent: string, environment?: QwikEnvironment) {
	const deleted: string[] = [];
	const environments = environment
		? [environment]
		: (['client', 'server', 'lib'] as const);

	for (const currentEnvironment of environments) {
		for (const path of devSegmentPaths(parent, root())) {
			const key = parentKey(currentEnvironment, path);
			const ids = parentSegments.get(key);
			if (!ids) continue;

			for (const id of ids) {
				if (segments.delete(id)) {
					deleted.push(id);
				}
			}
			parentSegments.delete(key);
		}
	}

	return deleted;
},
```

**Apply:** prefer adding tiny exported helpers only if Vite HMR needs shared normalization. Do not pass `ViteDevServer` or Vite module graph into `src/dev.ts`; Vite-specific graph invalidation belongs in `src/vite/hmr.ts`.

---

### `src/rolldown.ts` (bundler plugin, transform + event-driven invalidation)

**Analog:** `src/rolldown.ts`

**Options/API pattern** (`src/rolldown.ts` lines 28-37, 96-101):

```typescript
export interface QwikRolldownOptions {
	dev?: boolean;
	devServer?: QwikDevServer;
	entryStrategy?: EntryStrategy;
	experimental?: string[];
	hmr?: boolean;
	manifestInput?: QwikManifest | ServerQwikManifest;
	onManifest?: (manifest: QwikManifest) => void;
	optimizerOptions?: OptimizerOptions;
	rootDir?: string;
}

const dev = createQwikDev(options, segments, getRoot, segmentId);

return {
	api: {
		invalidateDevSegments: dev.invalidate,
	},
```

**Dev optimizer mode pattern** (`src/rolldown.ts` lines 313-320):

```typescript
mode:
	currentEnvironment === 'lib'
		? 'lib'
		: dev.isEnabled() && options.hmr !== false
			? 'hmr'
			: dev.isEnabled()
				? 'dev'
				: 'prod',
```

**Segment recording pattern** (`src/rolldown.ts` lines 325-338):

```typescript
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

**Apply:** avoid moving Vite `hotUpdate` logic here. If typing is needed, widen the private `api` shape consumed by `src/vite.ts`, but keep Rolldown generic.

---

### `test/helpers.ts` (test utility, request-response hook invocation)

**Analog:** `test/helpers.ts`

**Existing hook invoker pattern** (`test/helpers.ts` lines 51-68):

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

**Existing configResolved/helper context pattern** (`test/helpers.ts` lines 115-128):

```typescript
export function callConfigResolved(plugin: Pick<VitePlugin, 'configResolved'>, config: unknown) {
	return getHook(plugin.configResolved, 'configResolved').call({}, config as ResolvedConfig);
}

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

**Apply:** add focused helpers following this style: `callConfigureServer`, `callTransformIndexHtml`, and `callHotUpdate`. Include `hotUpdate?: unknown`, `transformIndexHtml?: unknown`, and `configureServer?: unknown` in `PluginHooks`. Pass a custom `this` context with `environment` when testing Vite Environment API behavior.

---

### `test/vite-plugin.test.ts` or `test/vite-hmr.test.ts` (test, event-driven + request-response)

**Analog:** `test/vite-plugin.test.ts` and `test/rolldown-runtime.test.ts`

**Vite plugin setup pattern** (`test/vite-plugin.test.ts` lines 1-13, 219-221):

```typescript
import { createOptimizer } from '@qwik.dev/optimizer';
import type { Plugin } from 'vite';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { qwik } from '../src/vite';
import {
	callConfigResolved,
	callLoad,
	callResolveId,
	callTransform,
	createViteHookContext,
	getPlugin,
} from './helpers';

function getQwikPlugin() {
	return getPlugin(qwik() as Plugin[], 'vite-plugin-qwik');
}
```

**Hook assertion pattern** (`test/vite-plugin.test.ts` lines 60-86):

```typescript
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

expect(optimizerMock.transformModules).toHaveBeenCalledWith(
	expect.objectContaining({
		rootDir: '/workspace/app',
		srcDir: '/workspace/app',
		isServer: false,
	}),
);
expect(result).toEqual({ code: 'optimized', map: null });
```

**HMR disabled negative test pattern** (`test/rolldown-runtime.test.ts` lines 521-554):

```typescript
const plugin = qwikClient({ dev: true, hmr: false });

callBuildStart(plugin, { cwd: '/workspace/app' });
await callTransform(plugin, 'export default 1;', '/workspace/app/src/home.tsx');
const resolved = await callResolveId(plugin, '/src/home.tsx_click_abc.js');
const code = await callLoad(plugin, (resolved as { id: string }).id);

expect(code).toBe('export const click = () => "click";');
expect(code).not.toContain('import.meta.hot.accept(');
expect(code).not.toContain("typeof document !== 'undefined'");
```

**Apply:** cover: bridge HTML tag injection in serve only and not with `hmr: false`; virtual bridge `resolveId`/`load`; client hot updates invalidate returned segment ids and send `qwik:hmr`; SSR hot updates forward source/importer URLs to `server.environments.client.hot.send`; disabled HMR sends `{ type: 'full-reload' }` and does not send custom events.

## Shared Patterns

### Serve/HMR Gating

**Source:** `src/vite.ts` lines 31-37 and `src/dev.ts` lines 30-32  
**Apply to:** `src/vite.ts`, `src/vite/hmr.ts`, `src/client/hmr-bridge.ts`, tests

```typescript
rolldownOptions.dev = resolvedConfig.command === 'serve';
rolldownOptions.rootDir = resolvedConfig.root;

const enabled = () => options.dev === true;
const hmrEnabled = () => enabled() && options.hmr !== false;
```

### Vite Internals Stay Vite-Specific

**Source:** `src/dev.ts` lines 6-9 and 181-183  
**Apply to:** `src/vite/hmr.ts`, `src/dev.ts`

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

### Source URL Filtering and Importer Fallback

**Source:** upstream `qwik-vite/src/plugins/vite.ts` lines 690-702  
**Apply to:** `src/vite/hmr.ts`

```typescript
const files = new Set<string>();
const isSourceUrl = (url: string) => /\.([mc]?[jt]sx?|mdx?)$/.test(url.split('?')[0]);
for (const m of ctx.modules) {
	const url = m.url.split('?')[0];
	if (m.type === 'js' && isSourceUrl(m.url)) {
		files.add(url);
	} else {
		for (const importer of m.importers) {
			if (importer.type === 'js' && isSourceUrl(importer.url)) {
				files.add(importer.url.split('?')[0]);
			}
		}
	}
}
```

### Error/Not-Handled Returns

**Source:** `src/vite.ts` lines 43-46, `src/rolldown.ts` lines 190-224  
**Apply to:** new virtual module resolve/load helpers

```typescript
if (config.build?.lib || config.build?.ssr || env.mode === 'ssr') {
	return;
}

if (!importer || !isRelative(source)) {
	return null;
}

if (!segment) {
	return null;
}
```

### Test Hook Invocation

**Source:** `test/helpers.ts` lines 130-141  
**Apply to:** any new HMR test helpers

```typescript
function getHook(value: unknown, name: string): FunctionHook {
	if (typeof value === 'function') {
		return value as FunctionHook;
	}
	if (value && typeof value === 'object' && 'handler' in value) {
		const handler = (value as { handler?: unknown }).handler;
		if (typeof handler === 'function') {
			return handler as FunctionHook;
		}
	}
	throw new Error(`Expected function ${name} hook`);
}
```

## No Analog Found

All likely Phase 2 files have close local or upstream analogs. The only caution is that `src/client/hmr-bridge.ts` has no local client-runtime file yet; use the upstream bridge behavior but keep the local implementation smaller and free of console logging unless a test requires diagnostics.

## Metadata

**Analog search scope:** `src/**/*.ts`, `test/**/*.ts`, `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/**/*.ts`  
**Files scanned:** 20+ matched files, 10 analog files read/excerpted  
**Pattern extraction date:** 2026-05-09
