# Phase 3: Serve/Build Gating and Regression Safety - Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 6
**Analogs found:** 6 / 6

## File Classification

| New/Modified File                                                                                                       | Role           | Data Flow      | Closest Analog                  | Match Quality |
| ----------------------------------------------------------------------------------------------------------------------- | -------------- | -------------- | ------------------------------- | ------------- |
| `test/static-html.test.ts`                                                                                              | test           | transform      | `test/static-html.test.ts`      | exact         |
| `test/vite-hmr.test.ts`                                                                                                 | test           | event-driven   | `test/vite-hmr.test.ts`         | exact         |
| `test/rolldown-runtime.test.ts`                                                                                         | test           | transform      | `test/rolldown-runtime.test.ts` | exact         |
| `test/vite-config.test.ts`                                                                                              | test           | config         | `test/vite-config.test.ts`      | exact         |
| `test/qwik-external.test.ts` or new fixture build test                                                                  | test           | file-I/O/batch | `test/qwik-external.test.ts`    | role-match    |
| Existing fixtures: `fixtures/vite-csr`, `fixtures/vite-nitro-v3`, `fixtures/vite-library`, `fixtures/rolldown-library*` | config/fixture | batch          | existing fixture configs        | exact         |

## Pattern Assignments

### `test/static-html.test.ts` (test, transform)

**Analog:** `test/static-html.test.ts`

**Imports pattern** (lines 1-3):

```typescript
import { describe, expect, test } from 'vitest';
import { qwikClient } from '../src/rolldown';
import { callBuildStart, callGenerateBundle } from './helpers';
```

**Core static CSR preloader pattern** (lines 6-22):

```typescript
test('injects Qwik preloader bootstrap into generated HTML assets', async () => {
	const plugin = qwikClient();
	const bundle = staticHtmlBundle();

	callBuildStart(plugin, { cwd: '/workspace/app' });
	await callGenerateBundle(plugin, bundle);
	const html = bundle['index.html'].source;

	expect(html).toContain('rel="modulepreload"');
	expect(html).toContain('href="/build/q-preloader.js"');
	expect(html).toContain('bundle-graph.json');
	expect(html).toContain('then(({l})=>l(');
	expect(html).toContain('l("/build/",b)');
	expect(html).toContain('href="/build/q-core.js"');
	expect(html).toContain('href="/build/q-root.js"');
	expect(html).toContain('href="/build/q-home.js"');
	expect(html).toContain('href="/build/q-click.js"');
});
```

**SSR/SSG duplicate-preloader guard pattern** (lines 25-35):

```typescript
test('does not duplicate preloader markup already emitted by SSR or SSG', async () => {
	const plugin = qwikClient();
	const bundle = staticHtmlBundle();
	const source = bundle['index.html'].source.replace('<html>', '<html q:render="ssr">');
	bundle['index.html'].source = source;

	callBuildStart(plugin, { cwd: '/workspace/app' });
	await callGenerateBundle(plugin, bundle);

	expect(bundle['index.html'].source).toBe(source);
});
```

**Fixture bundle builder pattern** (lines 66-143): use the existing `staticHtmlBundle()` helper shape with asset/chunk records and Qwik runtime chunks. Add leakage assertions against `bundle['index.html'].source` here rather than creating a separate source fixture.

---

### `test/vite-hmr.test.ts` (test, event-driven)

**Analog:** `test/vite-hmr.test.ts`

**Imports pattern** (lines 1-12):

```typescript
import { describe, expect, test, vi } from 'vitest';
import { createViteHmr, QWIK_HMR_BRIDGE_ID } from '../src/vite/hmr';
import { qwik } from '../src/vite';
import {
	callConfigResolved,
	callConfigureServer,
	callHotUpdate,
	callLoad,
	callResolveId,
	callTransformIndexHtml,
	getPlugin,
} from './helpers';
```

**No manual Vite client / bridge injection pattern** (lines 60-72):

```typescript
const plugin = getPlugin(qwik(), 'vite-plugin-qwik');

callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });

const tags = await callTransformIndexHtml(plugin, '<html></html>');
expect(tags).toEqual([
	{
		tag: 'script',
		attrs: { type: 'module', src: `/@id/${QWIK_HMR_BRIDGE_ID}` },
	},
]);
expect(JSON.stringify(tags)).not.toContain('@vite/client');
```

**Disabled HMR negative assertion pattern** (lines 200-226):

```typescript
const plugin = getPlugin(qwik({ hmr: false }), 'vite-plugin-qwik');
const send = vi.fn();
const environment = {
	name: 'client',
	moduleGraph: { getModuleById: vi.fn(), invalidateModule: vi.fn() },
	hot: { send },
};

callConfigResolved(plugin, { command: 'serve', root: '/workspace/app' });
Object.assign(plugin, { api: { ...plugin.api, invalidateDevSegments } });

expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
expect(JSON.stringify(send.mock.calls)).not.toContain('qwik:hmr');
```

**Apply to Phase 3:** Add production/build-mode assertions using `callConfigResolved(plugin, { command: 'build', root: '/workspace/app' })` and assert `callTransformIndexHtml()` is `undefined` and output strings do not contain `virtual:qwik-hmr-bridge`, `qwik:hmr`, or `qHmr`.

---

### `test/rolldown-runtime.test.ts` (test, transform)

**Analog:** `test/rolldown-runtime.test.ts`

**Imports pattern** (lines 1-3):

```typescript
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { plugin as qwikPlugin, qwikClient, qwikLib, qwikServer } from '../src/rolldown';
import { callBuildStart, callLoad, callOptions, callResolveId, callTransform } from './helpers';
```

**Environment gating pattern** (lines 80-89):

```typescript
test('does not set client-only input defaults for server and library builds', () => {
	const serverOptions = {};
	const libOptions = {};

	callOptions(qwikServer(), serverOptions);
	callOptions(qwikLib(), libOptions);

	expect(serverOptions).not.toHaveProperty('preserveEntrySignatures');
	expect(libOptions).not.toHaveProperty('preserveEntrySignatures');
});
```

**Dev-only accept code negative pattern** (lines 521-554):

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

**Apply to Phase 3:** Reuse the optimizer mock module shape from this file to assert prod, server, raw Rolldown, and library plugin paths never append `import.meta.hot.accept(`, `CustomEvent('qHmr'`, or `document.__hmrT`.

---

### `test/vite-config.test.ts` (test, config)

**Analog:** `test/vite-config.test.ts`

**Build output defaults pattern** (lines 29-50):

```typescript
const plugin = getQwikPlugin();
const config: UserConfig = {
	build: {
		rolldownOptions: {
			external: ['external-dependency'],
		},
	},
};

await callConfig(plugin, config, { command: 'build', mode: 'production' });

expect(config.build!.rolldownOptions).toMatchObject({
	external: ['external-dependency'],
	output: {
		entryFileNames: 'build/q-[hash].js',
		chunkFileNames: 'build/q-[hash].js',
		hoistTransitiveImports: false,
	},
});
expect(config.build!.modulePreload).toBe(false);
```

**Library host-control pattern** (lines 147-159):

```typescript
const plugin = getQwikPlugin();
const config: UserConfig = {
	build: {
		lib: { entry: 'src/index.tsx' },
		rolldownOptions: {},
	},
};

await callConfig(plugin, config, { command: 'build', mode: 'production' });

expect(config.build!.rolldownOptions!.output).toBeUndefined();
```

**Apply to Phase 3:** Keep build gating in Vite config tests focused on adapter decisions: production command should not enable dev/HMR paths, while library output remains host-owned.

---

### `test/qwik-external.test.ts` or new fixture build test (test, file-I/O/batch)

**Analog:** `test/qwik-external.test.ts`

**Imports and temp output pattern** (lines 1-7, 52-87):

```typescript
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { build } from 'rolldown';
import { expect, test, vi } from 'vitest';

const outDir = await mkdtemp(join(tmpdir(), 'qwik-bundler-noexternal-'));

try {
	await build({
		cwd: fixtureDir,
		input: 'src/server.ts',
		output: { dir: outDir, entryFileNames: 'server.js', format: 'esm' },
		platform: 'node',
		plugins: [qwikServer()],
	});

	const serverCode = await readFile(join(outDir, 'server.js'), 'utf-8');
	expect(/from\s+["']@fixtures\/rolldown-library["']/.test(serverCode)).toBe(false);
} finally {
	await rm(outDir, { recursive: true, force: true });
}
```

**Apply to Phase 3:** Use this pattern for direct Rolldown build leakage assertions. For generated output files, scan built JS/HTML text for forbidden dev strings: `virtual:qwik-hmr-bridge`, `qwik:hmr`, `import.meta.hot.accept(`, `CustomEvent('qHmr'`, and `document.__hmrT`.

---

### Existing fixture configs (config/fixture, batch)

**CSR Vite fixture:** `fixtures/vite-csr`

**Package script pattern** (lines `fixtures/vite-csr/package.json` 5-8):

```json
"scripts": {
	"dev": "vite",
	"build": "vite build"
}
```

**Plugin config pattern** (lines `fixtures/vite-csr/vite.config.ts` 1-6):

```typescript
import { defineConfig } from 'vite';
import { qwik } from 'qwik-bundler/vite';

export default defineConfig({
	plugins: [qwik()],
});
```

**SSR/Nitro Vite fixture:** `fixtures/vite-nitro-v3`

**Package script pattern** (lines `fixtures/vite-nitro-v3/package.json` 5-10):

```json
"scripts": {
	"dev": "vite",
	"build": "vite build",
	"preview": "vite preview",
	"start": "node .output/server/index.mjs"
}
```

**Client input owned by fixture pattern** (lines `fixtures/vite-nitro-v3/vite.config.ts` 5-16):

```typescript
export default defineConfig({
	plugins: [nitro(), qwik()],
	environments: {
		client: {
			build: {
				rollupOptions: {
					input: './src/root.tsx',
				},
			},
		},
	},
});
```

**Vite library fixture:** `fixtures/vite-library`

**Host-controlled library output pattern** (lines `fixtures/vite-library/vite.config.ts` 4-15):

```typescript
export default defineConfig({
	plugins: [qwik()],
	build: {
		lib: {
			entry: 'src/index.tsx',
			formats: ['es'],
		},
		rolldownOptions: {
			external: [/^@qwik\.dev\/core/],
		},
	},
});
```

**Raw Rolldown library fixture:** `fixtures/rolldown-library/rolldown.config.ts`

**Qwik lib build pattern** (lines 4-17):

```typescript
export default defineConfig({
	input: 'src/index.tsx',
	output: {
		dir: 'lib',
		format: 'esm',
		preserveModules: true,
		preserveModulesRoot: 'src',
		entryFileNames: '[name].qwik.mjs',
		chunkFileNames: '[name]-[hash].qwik.mjs',
	},
	platform: 'neutral',
	external: [/^@qwik\.dev\/core/],
	plugins: [qwikLib()],
});
```

## Shared Patterns

### Test hook harness

**Source:** `test/helpers.ts`
**Apply to:** All hook-level regression tests

```typescript
export function callConfigResolved(plugin: Pick<VitePlugin, 'configResolved'>, config: unknown) {
	return getHook(plugin.configResolved, 'configResolved').call({}, config as ResolvedConfig);
}

export function callTransformIndexHtml(plugin: PluginHooks, html: string, context?: unknown) {
	return getHook(plugin.transformIndexHtml, 'transformIndexHtml').call({}, html, context);
}

export function callGenerateBundle(plugin: PluginHooks, bundle: unknown, emitFile = vi.fn()) {
	return getHook(plugin.generateBundle, 'generateBundle').call({ emitFile }, {}, bundle, false);
}
```

### Static HTML guard implementation

**Source:** `src/build/static-html.ts`
**Apply to:** Static CSR and SSR/SSG duplicate-preloader tests

```typescript
if (item.type !== 'asset') continue;
if (!item.fileName.endsWith('.html')) continue;
if (typeof item.source !== 'string') continue;
if (SSR_RENDER_ATTR.test(item.source)) continue;

const paths = assetPaths(item.source, manifest);
const preloaderTags = qwikPreloaderTags(manifest, paths);
if (!preloaderTags) continue;
```

### HMR bridge gating implementation

**Source:** `src/vite/hmr.ts`
**Apply to:** Production/no-dev-code leakage tests

```typescript
transformIndexHtml() {
	if (!options.enabled()) {
		return undefined;
	}

	return [
		{
			tag: 'script',
			attrs: { type: 'module', src: joinURL(options.base(), QWIK_HMR_BRIDGE_PATH) },
		},
	];
}
```

### Forbidden dev-only strings

**Source:** Phase 2 tests and implementation
**Apply to:** All build-output leakage assertions

```typescript
expect(output).not.toContain('virtual:qwik-hmr-bridge');
expect(output).not.toContain('qwik:hmr');
expect(output).not.toContain('import.meta.hot.accept(');
expect(output).not.toContain("CustomEvent('qHmr'");
expect(output).not.toContain('document.__hmrT');
```

## No Analog Found

| File                                                | Role | Data Flow     | Reason                                                                                                                                                                                                                       |
| --------------------------------------------------- | ---- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full `pnpm --filter ... build` runner inside Vitest | test | batch/process | Existing tests use hook-level calls or direct `rolldown.build()`, not child-process fixture builds. Prefer existing fixture package scripts for manual/verification commands unless Phase 3 needs an in-test process runner. |

## Metadata

**Analog search scope:** `test/*.test.ts`, `test/helpers.ts`, `src/build/static-html.ts`, `src/vite/hmr.ts`, `fixtures/*/{package.json,vite.config.ts,rolldown.config.ts}`
**Files scanned:** 29
**Pattern extraction date:** 2026-05-09
