# Stack Research

**Domain:** Qwik HMR support in a Vite plugin / bundler integration  
**Project:** Qwik Bundler HMR Port  
**Researched:** 2026-05-09  
**Confidence:** HIGH for local package/API choices; MEDIUM for “standard 2025” ecosystem wording because Vite 8 is locally ahead of the upstream Qwik monorepo’s dev dependency.

## Recommended Stack

### Core Technologies

| Technology                       | Version                                                                                                 | Purpose                                                                                                                                                                                      | Why Recommended                                                                                                                                                                                                                                                            | Confidence |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Vite                             | `^8.0.10` in `qwik-bundler`; upstream Qwik syncpack allows `>=6 <9` and currently develops with `7.3.1` | Browser dev server, client HMR transport, environment-aware plugin hooks                                                                                                                     | Use Vite as the only browser HMR runtime. Vite owns `@vite/client`, websocket transport, HTML client injection, module graph invalidation, and environment-aware `hotUpdate`. This matches project scope and avoids building a raw Rolldown dev server.                    | HIGH       |
| Vite Environment API             | Vite 6+ / Vite 8 API surface                                                                            | Per-environment dev APIs: `this.environment`, `server.environments.client`, `server.environments.ssr`, `environment.transformRequest()`, `environment.moduleGraph`, `environment.hot.send()` | Qwik has separate client and SSR transforms. HMR must invalidate SSR-discovered source modules but notify the browser client. The standard modern API is environment-scoped, not global `server.moduleGraph` / `server.transformRequest(url, ssr)`.                        | HIGH       |
| Vite `hotUpdate` hook            | Vite 8 plugin API                                                                                       | Server-side HMR interception per environment                                                                                                                                                 | Prefer `hotUpdate(ctx)` over legacy `handleHotUpdate(ctx)` for this codebase. Upstream Qwik already uses `hotUpdate(ctx)`, checks `this.environment.name === 'ssr'`, and sends custom browser events through the client environment.                                       | HIGH       |
| `import.meta.hot` client HMR API | Vite HMR API                                                                                            | Browser bridge event handling and QRL segment self-acceptance                                                                                                                                | Qwik needs a tiny browser bridge that listens for custom `qwik:hmr` events, dispatches Qwik’s `qHmr` DOM event, and falls back to reload if active code does not acknowledge the update. Segment modules should self-accept with `import.meta.hot.accept(...)`.            | HIGH       |
| `@qwik.dev/optimizer`            | `2.1.0-beta.2` in `qwik-bundler`; workspace in upstream                                                 | Qwik transform, QRL segment generation, dev path metadata, HMR/dev transform mode                                                                                                            | Keep all Qwik semantic transforms in the optimizer. The bundler should supply `devPath`, `srcDir`, `rootDir`, `isServer`, source maps, and `mode: 'hmr'` when Vite HMR is enabled; it should not reimplement QRL parsing or component invalidation semantics in Vite glue. | HIGH       |
| Rolldown                         | `^1.0.0-rc.18`                                                                                          | Build/library/server bundling and plugin-compatible transform pipeline                                                                                                                       | Preserve Rolldown as the production/library/server bundler integration. HMR transport belongs in the Vite adapter only; shared optimizer/segment loading can remain Rolldown-compatible.                                                                                   | HIGH       |
| TypeScript                       | `^5.9.3`                                                                                                | Plugin implementation and tests                                                                                                                                                              | Matches local repo and upstream monorepo; use type-only imports from `vite` and `rolldown` to keep runtime dependencies optional where appropriate.                                                                                                                        | HIGH       |
| Node.js                          | `>=22` local; upstream Qwik requires `>=22.18.0`                                                        | Development/runtime baseline for tests and tooling                                                                                                                                           | Keep the local engine floor. Do not add compatibility branches for older Node unless fixtures prove a real need.                                                                                                                                                           | HIGH       |

### Supporting Libraries

| Library    | Version                           | Purpose                                                                                            | When to Use                                                                                                                                                                        | Confidence |
| ---------- | --------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `ufo`      | `^1.6.4`                          | URL/pathname parsing and root-relative browser URLs                                                | Use for parsing module IDs (`parsePath`), comparing URL-ish IDs, and preserving query semantics. Prefer over hand-rolled string splitting except for narrow, tested regex filters. | HIGH       |
| `pathe`    | `^2.0.3`                          | Cross-platform filesystem-style path handling                                                      | Use for `resolve`, `relative`, `dirname`, `normalize` in segment path resolution and root-relative `devPath` generation.                                                           | HIGH       |
| `vitefu`   | `^1.1.3`                          | Vite ecosystem helper dependency already present                                                   | Do not introduce it into HMR unless it removes real code. Current HMR needs direct Vite APIs more than helper abstractions.                                                        | MEDIUM     |
| Vitest     | `^4.0.18` local; upstream `4.1.0` | Unit tests for plugin hooks, bridge code generation, virtual segment loading, and opt-out behavior | Use focused unit tests for `hotUpdate`, bridge module resolution/loading, segment self-accept code, fallback reload path, and environment-specific forwarding.                     | HIGH       |
| Playwright | upstream `1.57.0`                 | Optional browser smoke tests                                                                       | Use only for end-to-end CSR Vite HMR verification after unit coverage. Avoid making every HMR detail depend on slow browser tests.                                                 | MEDIUM     |

### Development Tools

| Tool                                     | Purpose                                                                                                         | Notes                                                                                                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite dev server                          | HMR runtime and fixture smoke target                                                                            | `configureServer(server)` should store a narrow reference only where Vite transport is needed. Generic dev segment code should receive callbacks or a small `QwikDevServer` shape.           |
| Vite module graph / environment graph    | Invalidate QRL virtual segments after source changes                                                            | In Vite 8, use `environment.moduleGraph`; upstream invalidates segment modules by ID after parent invalidation.                                                                              |
| Vite environment `transformRequest(url)` | Lazily transform a parent module when a virtual QRL segment is requested before the parent has been transformed | Current `src/dev.ts` already uses `server.environments?.[environment === 'server' ? 'ssr' : 'client']?.transformRequest(parent) ?? server.transformRequest(parent)`. Keep this narrow shape. |
| Custom Vite HMR event                    | Server-to-browser Qwik notification                                                                             | Send `{ type: 'custom', event: 'qwik:hmr', data: { files, t: ctx.timestamp } }` to the client environment.                                                                                   |

## Recommended API Surface

### Public plugin option

Add an HMR opt-out without changing build behavior:

```ts
export interface VitePluginOptions extends QwikRolldownOptions {
	hmr?: boolean; // default true in Vite serve; false forces full reload / no bridge
}
```

Keep it Vite-facing. If the shared Rolldown plugin needs to know whether to emit segment self-accept code or optimizer `mode: 'hmr'`, pass a small internal boolean such as `rolldownOptions.hmr = resolvedConfig.command === 'serve' && options.hmr !== false` rather than exposing Vite concepts inside generic dev code.

### Vite plugin hooks to implement

| Hook/API                                           | Recommendation                                                                                                                                                                                                                                          | Why                                                                                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configResolved(config)`                           | Set `dev = config.command === 'serve'`, `rootDir = config.root`, and internal `hmr = dev && options.hmr !== false`.                                                                                                                                     | Keeps build, library, SSR, and raw Rolldown behavior unchanged.                                                                                                                   |
| `configureServer(server)`                          | Store only the Vite dev server reference needed by the Vite HMR transport and provide the existing narrow `QwikDevServer` shape to dev segment loading.                                                                                                 | Avoids leaking Vite server internals into generic QRL segment code.                                                                                                               |
| `transformIndexHtml()`                             | In serve mode with HMR enabled, inject only a Qwik HMR bridge module tag; do not inject `@vite/client`.                                                                                                                                                 | Vite already injects/serves its HMR client. The project explicitly excludes manual `@vite/client` injection.                                                                      |
| `resolveId/load`                                   | Resolve a private virtual ID such as `@qwik-hmr-bridge` and return bridge code.                                                                                                                                                                         | Keeps bridge runtime testable and isolated from optimizer transforms.                                                                                                             |
| `hotUpdate(ctx)`                                   | Use the Vite 8 environment-aware hook. In SSR environment, invalidate affected source/segment modules, collect JS/TS/MDX source URLs, and send one `qwik:hmr` custom event to `server.environments.client.hot`. If HMR is disabled, send `full-reload`. | Source updates often surface in the SSR environment, but the browser must re-render client-loaded QRL segments. This is the core cross-environment Qwik HMR behavior in upstream. |
| `environment.moduleGraph.invalidateModule(module)` | Invalidate virtual QRL segment modules whose parent changed.                                                                                                                                                                                            | Prevents stale segment code being re-served after a parent source edit.                                                                                                           |
| `environment.transformRequest(parentUrl)`          | Lazily transform parent source before serving a QRL virtual segment when needed.                                                                                                                                                                        | Handles first-load / out-of-order virtual segment requests without making segment loading depend on full Vite internals.                                                          |

### Browser bridge API

Use a minimal bridge equivalent to upstream behavior:

```ts
if (import.meta.hot) {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	import.meta.hot.on('qwik:hmr', (data: { files: string[]; t: number }) => {
		if (data.t === document.__hmrT) return;
		clearTimeout(timeout);
		document.__hmrT = data.t;
		document.__hmrDone = 0;
		document.dispatchEvent(new CustomEvent('qHmr', { detail: data }));
		timeout = setTimeout(() => {
			if (document.__hmrDone !== document.__hmrT) location.reload();
		}, 500);
	});
}
```

Segment modules should append self-accept code only when HMR is enabled and the segment is not a `worker$` segment:

```ts
if (import.meta.hot && typeof document !== 'undefined') {
	import.meta.hot.accept(() => {
		document.dispatchEvent(
			new CustomEvent('qHmr', {
				detail: { files: [parentUrl], t: document.__hmrT },
			}),
		);
	});
}
```

The `document.__hmrT` / `document.__hmrDone` globals are upstream-compatible but should be typed locally via an internal `.d.ts` or inline declaration in tests, not exported as public API.

## Installation

No new runtime dependencies are recommended.

```bash
# Already present in package.json
pnpm add @qwik.dev/optimizer@2.1.0-beta.2 pathe@^2.0.3 ufo@^1.6.4 vitefu@^1.1.3

# Already present as peer/dev dependencies
pnpm add -D vite@^8.0.10 rolldown@^1.0.0-rc.18 typescript@^5.9.3 vitest@^4.0.18 @types/node@^24.10.1
```

Do **not** add a websocket library, a custom dev server package, or a client runtime dependency for HMR.

## Alternatives Considered

| Recommended                                                         | Alternative                                                       | When to Use Alternative                                                                                                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite `hotUpdate`                                                    | Legacy `handleHotUpdate`                                          | Only if intentionally supporting pre-environment Vite versions. This repo targets Vite `^8.0.10`, so `hotUpdate` is the simpler and current API.            |
| `this.environment.hot.send` / `server.environments.client.hot.send` | `server.ws.send`                                                  | Use `server.ws.send` only for a legacy compatibility branch backed by a fixture. Modern Vite docs migrate custom events to environment hot channels.        |
| Vite-managed `@vite/client`                                         | Manual script injection                                           | Manual injection should remain out of scope unless a failing fixture proves Vite misses it. Vite owns the HMR client lifecycle.                             |
| Optimizer-driven QRL segment transforms                             | Hand-written QRL parser/rewriter in the Vite plugin               | Never preferred. The optimizer already owns Qwik semantics and upstream uses optimizer metadata (`segment`, `devPath`, transform `mode`) for this behavior. |
| Vite-only HMR transport                                             | Raw Rolldown browser dev server                                   | Use raw Rolldown for build/library/server tooling. A separate dev server is explicitly out of scope for this milestone.                                     |
| Small virtual bridge module                                         | Inline bridge code in every HTML transform or every source module | The virtual module is easier to test, dedupe, and opt out. Inline-per-source increases reload bugs and code noise.                                          |

## What NOT to Use

| Avoid                                                                       | Why                                                                                                                          | Use Instead                                                                                                                                |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `server.ws.send` as the primary API                                         | Vite’s current environment API routes HMR through environment hot channels; global websocket usage loses environment intent. | `this.environment.hot.send(...)` from client hooks, or `viteServer.environments.client.hot.send(...)` when forwarding from SSR to browser. |
| `handleHotUpdate` for new code                                              | It is the older global hook shape; Vite 8 documents `hotUpdate` for environment-aware plugins.                               | `hotUpdate(ctx)` plus `this.environment`.                                                                                                  |
| Passing full `ViteDevServer` deep into segment resolution/loading           | It couples generic dev segment code to Vite and makes raw Rolldown/build behavior harder to preserve.                        | A narrow object/callback: `{ environments?.client/ssr.transformRequest, transformRequest }`.                                               |
| Custom websocket/HMR protocol                                               | Duplicates Vite and creates failure modes around reconnects, overlay, and full reload.                                       | Vite custom HMR events over `import.meta.hot.on(...)`.                                                                                     |
| Manual `@vite/client` injection                                             | Vite already injects it in dev HTML; project scope explicitly excludes manual injection.                                     | Inject only the Qwik bridge module.                                                                                                        |
| HMR in raw Rolldown serve mode                                              | There is no browser dev server requirement for raw Rolldown in this project.                                                 | Limit browser HMR to Vite serve.                                                                                                           |
| Coupling HMR to static CSR preloader generation                             | Static CSR preloader injection is build-time HTML mutation and must remain isolated.                                         | Keep HMR in Vite serve hooks and bridge runtime; leave `src/build/static-html.ts` untouched unless tests prove interaction.                |
| Router/app entry defaults (`src/root.tsx`, `entry.ssr`, preview middleware) | Core bundler must not encode Qwik Router conventions.                                                                        | Router/app adapters own app defaults and preview path wiring.                                                                              |

## Stack Patterns by Variant

**If Vite serve and `hmr !== false`:**

- Enable `dev` and internal `hmr`.
- Use optimizer dev/HMR mode with source maps and `devPath`.
- Inject the Qwik bridge virtual module.
- Append segment self-accept code for non-`worker$` QRL segments.
- Forward SSR source changes to `server.environments.client.hot.send({ type: 'custom', event: 'qwik:hmr', data })`.

**If Vite serve and `hmr === false`:**

- Keep dev transforms but do not inject the bridge or segment self-accept code.
- On relevant source updates, send `{ type: 'full-reload' }` to the client environment.
- Preserve existing dev segment loading so non-HMR dev still works.

**If Vite build / SSR build / library build / raw Rolldown:**

- Do not use Vite HMR APIs.
- Do not inject bridge code.
- Keep existing optimizer modes: production/client manifest generation, server manifest injection, library inline strategy.

## Version Compatibility

| Package/API                        | Compatible With                                                                  | Notes                                                                                                                                                                            | Confidence |
| ---------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `vite@^8.0.10`                     | `hotUpdate`, `this.environment`, `server.environments.*`, `environment.hot.send` | This is the primary target in local `qwik-bundler`.                                                                                                                              | HIGH       |
| Upstream Qwik Vite plugin          | Vite `>=6 <9`; dev dependency `7.3.1`                                            | Upstream code already uses `hotUpdate(ctx)` and `viteServer.environments.client.hot.send(...)`, so the pattern is compatible with the intended Qwik range.                       | HIGH       |
| `@qwik.dev/optimizer@2.1.0-beta.2` | Qwik segment metadata and transform modes                                        | Local code uses `transformModules`; upstream uses `mode: 'hmr'` when dev server HMR is enabled. Verify exact accepted mode union during implementation if TypeScript exposes it. | MEDIUM     |
| `rolldown@^1.0.0-rc.18`            | Rollup-like hooks used by current `src/rolldown.ts`                              | HMR additions should not rely on Rolldown dev-server features. Keep shared hooks (`resolveId`, `load`, `transform`, `generateBundle`) compatible.                                | HIGH       |
| `pathe@^2.0.3` + `ufo@^1.6.4`      | Node 22 / ESM                                                                    | Good fit for cross-platform path and URL semantics in virtual module IDs.                                                                                                        | HIGH       |

## Sources

- Local project context: `.planning/PROJECT.md` — HMR requirements, scope boundaries, proposed file split. HIGH confidence.
- Local package versions: `qwik-bundler/package.json` — Vite `^8.0.10`, Rolldown `^1.0.0-rc.18`, optimizer `2.1.0-beta.2`, TypeScript `^5.9.3`, Node `>=22`. HIGH confidence.
- Upstream Qwik package versions: `/Users/jacksm5pro/dev/open-source/qwik/package.json` and `packages/qwik-vite/package.json` — Vite `7.3.1`, syncpack peer/prod `>=6 <9`, `magic-string` dev-only in upstream Qwik Vite. HIGH confidence.
- Upstream Qwik Vite plugin: `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/vite.ts` — `QWIK_HMR_BRIDGE_ID`, bridge code, virtual module load/resolve, `hotUpdate`, SSR-to-client `qwik:hmr` forwarding, full reload opt-out. HIGH confidence.
- Upstream Qwik core plugin: `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/plugin.ts` — default `devTools.hmr: true`, segment self-accept code, optimizer `mode: 'hmr'`, segment invalidation in `hotUpdate`. HIGH confidence.
- Current bundler code: `src/dev.ts`, `src/vite.ts`, `src/rolldown.ts` — existing narrow dev server shape, transformRequest fallback, optimizer transform flow, path utilities. HIGH confidence.
- Context7 Vite docs `/vitejs/vite/v8.0.10`: plugin HMR API, Environment API, `hotUpdate`, `environment.hot.send`, `server.environments`, `transformRequest`, migration away from global server APIs. HIGH confidence.
- Context7 Rolldown docs `/rolldown/rolldown`: Rollup-like plugin hooks and module side effects. MEDIUM confidence for HMR because Rolldown is not the browser HMR transport here.

---

_Stack research for: Qwik bundler Vite HMR implementation_  
_Researched: 2026-05-09_
