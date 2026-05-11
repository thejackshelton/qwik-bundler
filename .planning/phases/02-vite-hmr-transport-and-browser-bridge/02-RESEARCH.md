# Phase 2: Vite HMR Transport and Browser Bridge - Research

**Researched:** 2026-05-09 [VERIFIED: system date]  
**Domain:** Vite 8 environment-aware HMR transport, Qwik browser HMR bridge, and Vite serve opt-out fallback [VERIFIED: .planning/ROADMAP.md]  
**Confidence:** HIGH [VERIFIED: Vite docs + upstream Qwik plugin + local code]

## Summary

Phase 2 should implement Qwik HMR as Vite-serve-only transport plus a browser bridge, not as raw Rolldown HMR or production output behavior. [VERIFIED: .planning/REQUIREMENTS.md] [VERIFIED: AGENTS.md] Vite 8 provides the `hotUpdate` hook with `this.environment`, per-environment module graphs, and `environment.hot.send(...)` for full reload and custom events. [CITED: https://vite.dev/guide/api-environment-plugins.html] The upstream Qwik Vite plugin uses that shape: it injects `@qwik-hmr-bridge`, resolves/loads a virtual bridge module, invalidates generated QRL segment modules, and forwards SSR-discovered source changes to `server.environments.client.hot.send({ type: 'custom', event: 'qwik:hmr', data: { files, t } })`. [VERIFIED: /Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/vite.ts] [VERIFIED: /Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/plugin.ts]

The local Phase 1 foundation already provides environment-scoped generated segment IDs, parent-to-segment invalidation, lazy parent transforms through a narrow callback, and HMR-gated `import.meta.hot.accept(` code for non-worker dev segments. [VERIFIED: .planning/phases/01-dev-qrl-segment-core/01-VERIFICATION.md] Phase 2 should consume that foundation through the private plugin API rather than moving Vite server internals into `src/dev.ts` or `src/rolldown.ts`. [VERIFIED: AGENTS.md] [VERIFIED: src/dev.ts] [VERIFIED: src/rolldown.ts]

**Primary recommendation:** Add a small Vite-specific HMR helper (`src/vite/hmr.ts`) and browser-only bridge module (`src/client/hmr-bridge.ts`), compose them from `src/vite.ts`, send `qwik:hmr` only when `hmr !== false`, and send `{ type: 'full-reload' }` when `hmr: false`. [VERIFIED: .planning/phases/02-vite-hmr-transport-and-browser-bridge/02-PATTERNS.md] [VERIFIED: upstream Qwik Vite plugin]

## Project Constraints (from AGENTS.md)

- Compare Vite, dev-server, HMR, optimizer, and related behavior against `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins` before changing it. [VERIFIED: AGENTS.md]
- Keep the rewrite simpler and easier to read than upstream unless a fixture or test proves extra complexity is needed. [VERIFIED: AGENTS.md]
- Provide Qwik bundling services only; do not add Qwik Router, preview middleware, or app-framework entry defaults. [VERIFIED: AGENTS.md]
- Keep `src/rolldown.ts` focused on bundler integration, optimizer transforms, manifest creation, and output hooks. [VERIFIED: AGENTS.md]
- Keep `src/vite.ts` focused on Vite adapter wiring only. [VERIFIED: AGENTS.md]
- Split HMR code between dev segment handling, Vite HMR wiring, and browser bridge code. [VERIFIED: AGENTS.md]
- Vite should own the full dev/HMR browser experience; raw Rolldown remains build/library/server tooling unless a separate dev server is intentionally added. [VERIFIED: AGENTS.md]
- HMR should be automatic in Vite serve and opt out via `hmr: false`. [VERIFIED: AGENTS.md]
- Avoid passing Vite server internals deep into generic dev segment code; use narrow callbacks. [VERIFIED: AGENTS.md]
- Prefer `ufo` for URL handling and `pathe` for filesystem-style path handling. [VERIFIED: AGENTS.md]
- For behavior changes, add a robust failing test before implementation; preserve CSR, SSR/Nitro, and library fixture behavior. [VERIFIED: AGENTS.md]

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                                                   | Research Support                                                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GATE-01 | Enable Qwik HMR automatically in Vite serve default options. [VERIFIED: .planning/REQUIREMENTS.md]                                            | Use `configResolved.command === 'serve'` plus `options.hmr !== false` gating. [VERIFIED: src/vite.ts]                                                     |
| GATE-02 | `hmr: false` disables bridge injection, segment accept code, and custom events. [VERIFIED: .planning/REQUIREMENTS.md]                         | Phase 1 already gates segment accept code; Phase 2 must gate bridge injection/load and event sending. [VERIFIED: src/dev.ts]                              |
| GATE-03 | Relevant source updates full-reload when `hmr: false`. [VERIFIED: .planning/REQUIREMENTS.md]                                                  | Use Vite HMR full reload messages through the client hot channel. [CITED: https://vite.dev/guide/api-environment-plugins.html]                            |
| TRAN-01 | Inject only the Qwik HMR bridge into dev HTML and do not manually inject `@vite/client`. [VERIFIED: .planning/REQUIREMENTS.md]                | Vite owns its client; `transformIndexHtml` can return tag descriptors for bridge only. [CITED: https://vite.dev/guide/api-plugin.html#transformindexhtml] |
| TRAN-02 | Resolve/load a virtual Qwik HMR bridge module. [VERIFIED: .planning/REQUIREMENTS.md]                                                          | Vite/Rolldown virtual module convention supports resolve/load IDs. [CITED: https://vite.dev/guide/api-plugin.html#virtual-modules-convention]             |
| TRAN-03 | Client updates invalidate affected generated segments and send `qwik:hmr` with normalized source files. [VERIFIED: .planning/REQUIREMENTS.md] | Call private `api.invalidateDevSegments` and invalidate returned module graph IDs before custom event send. [VERIFIED: src/rolldown.ts]                   |
| TRAN-04 | SSR updates forward relevant normalized source files to client HMR. [VERIFIED: .planning/REQUIREMENTS.md]                                     | Upstream forwards SSR source/importer files to `server.environments.client.hot.send`. [VERIFIED: upstream Qwik Vite plugin]                               |
| TRAN-05 | Non-source module changes use importer/source fallback, not broad broadcasts. [VERIFIED: .planning/REQUIREMENTS.md]                           | Upstream filters JS/TS/MDX URLs and otherwise checks JS importers. [VERIFIED: upstream Qwik Vite plugin]                                                  |
| TRAN-06 | Vite server internals stay inside Vite-specific HMR code. [VERIFIED: .planning/REQUIREMENTS.md]                                               | Keep graph/hot-channel logic in `src/vite/hmr.ts`; `src/dev.ts` keeps only `QwikDevServer.transformRequest`. [VERIFIED: src/dev.ts]                       |
| BRDG-01 | Browser bridge converts Vite `qwik:hmr` to Qwik `qHmr`. [VERIFIED: .planning/REQUIREMENTS.md]                                                 | Upstream bridge listens with `import.meta.hot.on('qwik:hmr', ...)` and dispatches `CustomEvent('qHmr')`. [VERIFIED: upstream Qwik Vite plugin]            |
| BRDG-02 | Browser bridge dedupes stale/repeated payloads by timestamp. [VERIFIED: .planning/REQUIREMENTS.md]                                            | Upstream compares `data.t` to `document.__hmrT`. [VERIFIED: upstream Qwik Vite plugin]                                                                    |
| BRDG-03 | Browser bridge full-reloads if Qwik does not acknowledge in fallback window. [VERIFIED: .planning/REQUIREMENTS.md]                            | Upstream reloads if `document.__hmrDone !== document.__hmrT` after 500 ms. [VERIFIED: upstream Qwik Vite plugin]                                          |
| BRDG-04 | Browser bridge runtime remains isolated in a client-facing module. [VERIFIED: .planning/REQUIREMENTS.md]                                      | Put browser code in `src/client/hmr-bridge.ts` and load it via the virtual module. [VERIFIED: 02-PATTERNS.md]                                             |
| TEST-01 | Unit tests cover bridge HTML injection and disabled non-injection. [VERIFIED: .planning/REQUIREMENTS.md]                                      | Add `callTransformIndexHtml` helper and assert serve/default vs `hmr: false`. [VERIFIED: test/helpers.ts]                                                 |
| TEST-02 | Unit tests cover virtual bridge resolve/load. [VERIFIED: .planning/REQUIREMENTS.md]                                                           | Extend existing `callResolveId`/`callLoad` patterns. [VERIFIED: test/helpers.ts]                                                                          |
| TEST-03 | Unit tests cover SSR hot update forwarding. [VERIFIED: .planning/REQUIREMENTS.md]                                                             | Add `callHotUpdate` with `this.environment.name === 'ssr'` and mock client hot channel. [CITED: https://vite.dev/guide/api-environment-plugins.html]      |
| TEST-04 | Unit tests cover `hmr: false` fallback/full reload. [VERIFIED: .planning/REQUIREMENTS.md]                                                     | Assert no custom event and one `{ type: 'full-reload' }` send. [CITED: https://vite.dev/guide/api-environment-plugins.html]                               |

</phase_requirements>

## Architectural Responsibility Map

| Capability                               | Primary Tier                                                                          | Secondary Tier                                                       | Rationale                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serve-mode HMR enablement and opt-out    | Frontend Server (Vite dev server) [CITED: Vite docs]                                  | Browser / Client [CITED: Vite HMR API]                               | The Vite plugin knows `command === 'serve'`, owns `transformIndexHtml`, and can send HMR events; the browser only consumes injected runtime code. [VERIFIED: src/vite.ts]                |
| Virtual bridge module resolution/loading | Frontend Server (Vite plugin pipeline) [CITED: Vite Plugin API]                       | Browser / Client [CITED: Vite Plugin API]                            | Resolve/load hooks expose a browser importable module while keeping source generation in plugin code. [CITED: https://vite.dev/guide/api-plugin.html#virtual-modules-convention]         |
| Client source hot-update transport       | Frontend Server (Vite client environment) [CITED: Vite Environment API]               | Browser / Client [CITED: Vite HMR API]                               | `hotUpdate` runs per environment and `environment.hot.send` broadcasts to application instances. [CITED: https://vite.dev/guide/api-environment-plugins.html]                            |
| SSR-to-client forwarding                 | Frontend Server (Vite SSR + client environments) [CITED: Vite Environment API]        | Browser / Client [CITED: Vite HMR API]                               | SSR graph discovers server-side module changes, but Qwik browser QRLs update via the client hot channel. [VERIFIED: upstream Qwik Vite plugin]                                           |
| Generated segment invalidation           | Frontend Server (Vite HMR helper + local dev segment API) [VERIFIED: src/rolldown.ts] | API / Backend: none [ASSUMED]                                        | Segment cache ownership is local plugin state, while Vite-specific module graph invalidation belongs in Vite helper code. [VERIFIED: src/dev.ts]                                         |
| Qwik runtime acknowledgement             | Browser / Client [VERIFIED: Qwik core use-hmr.ts]                                     | Frontend Server fallback timer [VERIFIED: upstream Qwik Vite plugin] | Qwik core sets `document.__hmrDone = document.__hmrT` when a matching `qHmr` update is handled. [VERIFIED: /Users/jacksm5pro/dev/open-source/qwik/packages/qwik/src/core/use/use-hmr.ts] |

## Standard Stack

### Core

| Library               | Version                                                                                                               | Purpose                                                                                              | Why Standard                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `vite`                | Project: `^8.0.10`; npm current: `8.0.11`, modified 2026-05-07. [VERIFIED: package.json] [VERIFIED: npm registry]     | Dev server, HTML transform, environment-aware HMR, custom event transport. [CITED: Vite docs]        | Vite is the declared peer/dev dependency and is the required browser HMR owner. [VERIFIED: package.json] [VERIFIED: AGENTS.md] |
| `@qwik.dev/optimizer` | Project/current: `2.1.0-beta.2`, modified 2026-04-30. [VERIFIED: package.json] [VERIFIED: npm registry]               | Qwik transform and HMR-mode QRL segment generation. [VERIFIED: src/rolldown.ts]                      | Local code already delegates Qwik semantics to the optimizer. [VERIFIED: src/rolldown.ts]                                      |
| `rolldown`            | Project: `^1.0.0-rc.18`; npm current: `1.0.0`, modified 2026-05-07. [VERIFIED: package.json] [VERIFIED: npm registry] | Plugin type/build integration boundary. [VERIFIED: package.json]                                     | Raw Rolldown must not own browser HMR in this phase. [VERIFIED: AGENTS.md]                                                     |
| `vitest`              | Project: `^4.0.18`; npm current: `4.1.5`, modified 2026-05-05. [VERIFIED: package.json] [VERIFIED: npm registry]      | Unit tests for Vite plugin hooks and helper behavior. [VERIFIED: vite.config.ts via AGENTS.md stack] | Existing tests use Vitest and direct hook invocation. [VERIFIED: test/helpers.ts]                                              |

### Supporting

| Library | Version                                                                                                     | Purpose                                                                                     | When to Use                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `ufo`   | Project/current: `^1.6.4` / `1.6.4`, modified 2026-04-29. [VERIFIED: package.json] [VERIFIED: npm registry] | URL/query/pathname parsing. [VERIFIED: src/dev.ts]                                          | Use for stripping query/hash and URL-like module IDs. [VERIFIED: AGENTS.md]                       |
| `pathe` | Project/current: `^2.0.3` / `2.0.3`, modified 2025-02-11. [VERIFIED: package.json] [VERIFIED: npm registry] | POSIX-like filesystem path normalization and relative path handling. [VERIFIED: src/dev.ts] | Use for root-relative source normalization and platform separator handling. [VERIFIED: AGENTS.md] |

### Alternatives Considered

| Instead of                                | Could Use                                   | Tradeoff                                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite `hotUpdate` + `environment.hot.send` | Legacy `handleHotUpdate` + `server.ws.send` | Vite docs document `hotUpdate` as the environment-aware hook and recommend environment hot channels for custom events. [CITED: https://vite.dev/guide/api-environment-plugins.html] |
| Virtual bridge module                     | Inline browser code in `src/vite.ts`        | A module keeps browser runtime isolated and testable. [VERIFIED: 02-PATTERNS.md]                                                                                                    |
| Existing `src/dev.ts` invalidation API    | Re-scan optimizer outputs from Vite code    | Existing API already maps parent source to generated segment IDs. [VERIFIED: src/dev.ts]                                                                                            |
| `ufo`/`pathe` normalization               | Hand-rolled string splitting                | Project rules explicitly prefer `ufo` and `pathe`. [VERIFIED: AGENTS.md]                                                                                                            |

**Installation:** no new dependencies should be installed for Phase 2. [VERIFIED: package.json] [VERIFIED: AGENTS.md]

```bash
# No install needed; use existing Vite, optimizer, ufo, pathe, and Vitest stack.
```

## Architecture Patterns

### System Architecture Diagram

```text
Source file edit
  │
  ▼
Vite dev server runs hotUpdate per environment
  │
  ├─ client environment
  │    ├─ normalize changed source/importer files
  │    ├─ call basePlugin.api.invalidateDevSegments(parent, 'client')
  │    ├─ invalidate returned segment module IDs in environment.moduleGraph
  │    └─ if hmr enabled: environment.hot.send custom qwik:hmr
  │       else: environment.hot.send full-reload
  │
  └─ ssr environment
       ├─ normalize SSR source/importer files
       ├─ call basePlugin.api.invalidateDevSegments(parent, 'server')
       └─ forward relevant files to server.environments.client.hot
          ├─ if hmr enabled: custom qwik:hmr
          └─ else: full-reload

index.html in Vite serve
  └─ transformIndexHtml injects <script type="module" src="/@id/...bridge...">
       └─ Vite resolveId/load serves virtual bridge module
            └─ browser bridge listens to import.meta.hot.on('qwik:hmr')
                 ├─ dedupe by document.__hmrT
                 ├─ dispatch CustomEvent('qHmr', { detail: { files, t } })
                 └─ reload if document.__hmrDone does not match document.__hmrT
```

### Recommended Project Structure

```text
src/
├── vite.ts              # Compose Vite adapter, HMR helper, and Rolldown plugin [VERIFIED: src/vite.ts]
├── vite/
│   └── hmr.ts           # Vite-only HMR bridge ID, HTML tag, hotUpdate, graph invalidation [VERIFIED: 02-PATTERNS.md]
├── client/
│   └── hmr-bridge.ts    # Browser-only bridge code loaded as virtual module [VERIFIED: 02-PATTERNS.md]
├── dev.ts              # Existing generic dev segment loading/invalidation only [VERIFIED: src/dev.ts]
└── rolldown.ts          # Existing optimizer and private invalidation API [VERIFIED: src/rolldown.ts]

test/
├── helpers.ts           # Add hook callers for transformIndexHtml/configureServer/hotUpdate [VERIFIED: test/helpers.ts]
└── vite-hmr.test.ts     # Focused Phase 2 tests [VERIFIED: 02-PATTERNS.md]
```

### Pattern 1: Vite HMR helper owns transport

**What:** Create a helper that exposes bridge resolve/load, bridge HTML tags, and `handleHotUpdate`. [VERIFIED: 02-PATTERNS.md]  
**When to use:** Use from `src/vite.ts` when `resolvedConfig.command === 'serve'`. [VERIFIED: src/vite.ts]  
**Example:**

```typescript
// Source: Vite Environment API docs + upstream Qwik Vite plugin
hotUpdate(ctx) {
	return hmr.hotUpdate(this.environment, ctx);
}
```

### Pattern 2: Forward custom Qwik events through Vite hot channels

**What:** Send `{ type: 'custom', event: 'qwik:hmr', data: { files, t } }` to the client hot channel. [VERIFIED: upstream Qwik Vite plugin]  
**When to use:** Use for relevant source changes when `hmr !== false`. [VERIFIED: .planning/REQUIREMENTS.md]  
**Example:**

```typescript
// Source: https://vite.dev/guide/api-environment-plugins.html
environment.hot.send({
	type: 'custom',
	event: 'qwik:hmr',
	data: { files: [...files], t: ctx.timestamp },
});
```

### Pattern 3: Browser bridge stays browser-only

**What:** Guard `import.meta.hot`, listen for `qwik:hmr`, dispatch `qHmr`, and fallback-reload if Qwik does not acknowledge. [VERIFIED: upstream Qwik Vite plugin]  
**When to use:** Load only through the virtual bridge module injected into Vite serve HTML. [VERIFIED: .planning/REQUIREMENTS.md]  
**Example:**

```typescript
// Source: upstream Qwik Vite bridge + https://vite.dev/guide/api-hmr.html
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

### Anti-Patterns to Avoid

- **Manual `@vite/client` injection:** Vite already owns its HMR client in serve mode, and requirements explicitly exclude manual injection. [VERIFIED: .planning/REQUIREMENTS.md]
- **Putting Vite module graph logic in `src/dev.ts`:** Generic dev segment code currently has no Vite type dependency and should stay that way. [VERIFIED: src/dev.ts] [VERIFIED: AGENTS.md]
- **Broadcasting every changed module:** Upstream filters source URLs and uses importer fallback for non-source JS modules. [VERIFIED: upstream Qwik Vite plugin]
- **Embedding bridge code directly across `src/vite.ts`:** Browser runtime must remain isolated in a client-facing module. [VERIFIED: .planning/REQUIREMENTS.md]
- **Adding build/library HMR behavior in this phase:** Phase 2 scope is Vite serve transport; build leakage checks are Phase 3. [VERIFIED: .planning/ROADMAP.md]

## Don't Hand-Roll

| Problem                    | Don't Build                                    | Use Instead                                                             | Why                                                                                                                               |
| -------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Browser HMR websocket      | Custom websocket server/client                 | Vite `environment.hot.send` and `import.meta.hot.on` [CITED: Vite docs] | Vite already provides client-server HMR transport and custom events. [CITED: https://vite.dev/guide/api-environment-plugins.html] |
| HTML dev client injection  | Manual `@vite/client` script                   | `transformIndexHtml` bridge tag only [CITED: Vite docs]                 | Requirements explicitly forbid manual `@vite/client` injection. [VERIFIED: .planning/REQUIREMENTS.md]                             |
| Qwik rerender detection    | Custom DOM/component scanner                   | Qwik `qHmr` event and Qwik core acknowledgement [VERIFIED: Qwik core]   | Qwik core already listens for `qHmr` and sets `__hmrDone`. [VERIFIED: Qwik core use-hmr.ts]                                       |
| Segment cache invalidation | Recompute generated modules in Vite HMR helper | `basePlugin.api.invalidateDevSegments` [VERIFIED: src/rolldown.ts]      | Phase 1 already validated parent-to-segment invalidation. [VERIFIED: 01-VERIFICATION.md]                                          |
| URL/path parsing           | Regex-only path manipulation                   | `ufo` + `pathe` [VERIFIED: AGENTS.md]                                   | Project rules prefer these libraries for edge cases. [VERIFIED: AGENTS.md]                                                        |

**Key insight:** Qwik HMR requires both module-level segment invalidation and document-level `qHmr` notification; either mechanism alone is incomplete for Qwik's lazy QRL runtime. [VERIFIED: Qwik core qrl-class-dev.ts] [VERIFIED: upstream Qwik Vite plugin]

## Common Pitfalls

### Pitfall 1: Sending from the wrong Vite environment

**What goes wrong:** SSR-discovered updates never reach the browser. [VERIFIED: upstream Qwik Vite plugin]  
**Why it happens:** Vite 8 runs `hotUpdate` per environment, so SSR and client graphs/channels are distinct. [CITED: https://vite.dev/guide/api-environment-plugins.html]  
**How to avoid:** For `environment.name === 'ssr'`, forward relevant files to `server.environments.client.hot.send(...)`. [VERIFIED: upstream Qwik Vite plugin]  
**Warning signs:** Tests show SSR `hotUpdate` invalidates server modules but no client hot-channel send occurs. [ASSUMED]

### Pitfall 2: Forgetting `hmr: false` disables all custom Qwik HMR paths

**What goes wrong:** A disabled configuration still injects bridge code or sends `qwik:hmr`. [VERIFIED: .planning/REQUIREMENTS.md]  
**Why it happens:** Phase 1 gates segment accept code, but Phase 2 adds separate bridge and transport gates. [VERIFIED: src/dev.ts]  
**How to avoid:** Centralize `hmrEnabled = serve && options.hmr !== false` in the Vite HMR helper. [VERIFIED: 02-PATTERNS.md]  
**Warning signs:** `hmr: false` tests find bridge IDs, `qHmr`, or `qwik:hmr` in output. [VERIFIED: .planning/REQUIREMENTS.md]

### Pitfall 3: Missing Vite's literal HMR accept requirement

**What goes wrong:** Generated segment modules do not become Vite HMR boundaries. [CITED: https://vite.dev/guide/api-hmr.html]  
**Why it happens:** Vite statically scans for the whitespace-sensitive string `import.meta.hot.accept(`. [CITED: https://vite.dev/guide/api-hmr.html]  
**How to avoid:** Preserve Phase 1's literal append and do not refactor it into a shape Vite cannot scan. [VERIFIED: src/dev.ts]  
**Warning signs:** Browser reloads even though segment code appears to contain dynamic HMR logic. [ASSUMED]

### Pitfall 4: Over-broadcasting non-source module changes

**What goes wrong:** CSS/raw/non-source imports trigger unrelated Qwik component updates. [VERIFIED: upstream Qwik Vite plugin]  
**Why it happens:** Some non-source imports may appear as JS modules but their URLs are not JS/TS source files. [VERIFIED: upstream Qwik Vite plugin]  
**How to avoid:** Use `/\.([mc]?[jt]sx?|mdx?)$/` source filtering after query stripping, and otherwise inspect JS importers. [VERIFIED: upstream Qwik Vite plugin]  
**Warning signs:** `qwik:hmr` payload includes `?raw`, CSS inline URLs, or generated virtual IDs instead of source files. [ASSUMED]

### Pitfall 5: Console/logging copied from upstream bridge

**What goes wrong:** Local core library emits noisy console logs. [VERIFIED: upstream Qwik Vite plugin]  
**Why it happens:** Upstream bridge includes diagnostic `console.log` calls. [VERIFIED: upstream Qwik Vite plugin]  
**How to avoid:** Preserve behavior but omit console logging unless tests require diagnostics. [VERIFIED: AGENTS.md] [VERIFIED: 02-PATTERNS.md]  
**Warning signs:** Browser bridge source contains console output not tied to test requirements. [VERIFIED: AGENTS.md]

## Code Examples

### Virtual bridge resolve/load

```typescript
// Source: https://vite.dev/guide/api-plugin.html#virtual-modules-convention
const QWIK_HMR_BRIDGE_ID = 'virtual:qwik-hmr-bridge';
const RESOLVED_QWIK_HMR_BRIDGE_ID = '\0' + QWIK_HMR_BRIDGE_ID;

resolveId(id) {
	if (id === QWIK_HMR_BRIDGE_ID) return RESOLVED_QWIK_HMR_BRIDGE_ID;
	return null;
}

load(id) {
	if (id === RESOLVED_QWIK_HMR_BRIDGE_ID) return bridgeCode;
	return null;
}
```

### Full reload fallback

```typescript
// Source: https://vite.dev/guide/api-environment-plugins.html
hotUpdate({ modules, timestamp }) {
	if (this.environment.name !== 'client') return;
	const invalidated = new Set();
	for (const mod of modules) {
		this.environment.moduleGraph.invalidateModule(mod, invalidated, timestamp, true);
	}
	this.environment.hot.send({ type: 'full-reload' });
	return [];
}
```

### SSR-to-client source forwarding

```typescript
// Source: upstream Qwik Vite plugin lines 690-708
const files = new Set<string>();
const isSourceUrl = (url: string) => /\.([mc]?[jt]sx?|mdx?)$/.test(url.split('?')[0]);
for (const module of ctx.modules) {
	const url = module.url.split('?')[0];
	if (module.type === 'js' && isSourceUrl(module.url)) {
		files.add(url);
	} else {
		for (const importer of module.importers) {
			if (importer.type === 'js' && isSourceUrl(importer.url)) {
				files.add(importer.url.split('?')[0]);
			}
		}
	}
}
if (files.size > 0) {
	server.environments.client.hot.send({
		type: 'custom',
		event: 'qwik:hmr',
		data: { files: [...files], t: ctx.timestamp },
	});
}
```

## State of the Art

| Old Approach                             | Current Approach                                | When Changed                                                                                                         | Impact                                                                                               |
| ---------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `handleHotUpdate` and `server.ws.send`   | `hotUpdate` and `this.environment.hot.send`     | Vite Environment API era; Vite 8 docs show `hotUpdate`. [CITED: https://vite.dev/guide/api-environment-plugins.html] | Plan for Vite 8 APIs rather than legacy compatibility branches. [VERIFIED: package.json]             |
| Single server module graph               | Per-environment module graphs and hot channels  | Vite Environment API. [CITED: https://vite.dev/guide/api-environment-plugins.html]                                   | SSR changes require explicit forwarding to the client channel. [VERIFIED: upstream Qwik Vite plugin] |
| Inline HMR runtime string in Vite plugin | Isolated browser bridge module loaded virtually | Local project pattern recommendation. [VERIFIED: 02-PATTERNS.md]                                                     | Improves readability and separation versus upstream. [VERIFIED: AGENTS.md]                           |

**Deprecated/outdated:**

- Legacy-only `server.ws.send` as the primary Phase 2 transport is outdated for this Vite 8 project; use `environment.hot.send` or `server.environments.client.hot.send` for environment-aware transport. [CITED: https://vite.dev/guide/api-environment-plugins.html]
- Manual `@vite/client` injection is out of scope and conflicts with requirements. [VERIFIED: .planning/REQUIREMENTS.md]

## Assumptions Log

| #   | Claim                                                                                                | Section                          | Risk if Wrong                                                |
| --- | ---------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| A1  | Generic segment invalidation has no API/backend tier responsibility.                                 | Architectural Responsibility Map | Low; only affects documentation wording, not implementation. |
| A2  | Warning signs about test/browser symptoms are predictive rather than verified failures in this repo. | Common Pitfalls                  | Low; implementation should still rely on verified tests.     |

## Open Questions (RESOLVED)

None. Phase 2 planning can proceed with Vite 8 `hotUpdate`, virtual bridge injection, upstream-compatible event payloads, `hmr: false` full reload fallback, and focused unit tests. [VERIFIED: Vite docs] [VERIFIED: upstream Qwik Vite plugin] [VERIFIED: local Phase 1 verification]

## Environment Availability

| Dependency                   | Required By                       | Available                   | Version                                                                                       | Fallback                                                       |
| ---------------------------- | --------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Node.js                      | Running pnpm/Vitest/build tooling | ✓ [VERIFIED: local command] | `v24.15.0` [VERIFIED: local command]                                                          | None needed; package requires `>=22`. [VERIFIED: package.json] |
| pnpm                         | Test/build commands               | ✓ [VERIFIED: local command] | `10.33.2` [VERIFIED: local command]                                                           | None needed. [VERIFIED: package.json]                          |
| npm registry access          | Version verification              | ✓ [VERIFIED: npm registry]  | npm responses returned 2026-05-09. [VERIFIED: npm registry]                                   | Use lockfile/package versions if offline. [ASSUMED]            |
| Vite package/docs            | HMR API implementation            | ✓ [VERIFIED: package.json]  | Project `^8.0.10`; docs fetched for `v8.0.10`. [VERIFIED: Context7 CLI]                       | No legacy fallback recommended. [CITED: Vite docs]             |
| Local upstream Qwik checkout | Behavior comparison               | ✓ [VERIFIED: local read]    | `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins` [VERIFIED: AGENTS.md] | Block planning if missing in future sessions. [ASSUMED]        |

**Missing dependencies with no fallback:** None found. [VERIFIED: local command]  
**Missing dependencies with fallback:** None found for Phase 2. [VERIFIED: local command]

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies                            | Standard Control                                                                                                                    |
| --------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | no [VERIFIED: phase requirements]  | No auth surface in Vite HMR bridge. [VERIFIED: .planning/REQUIREMENTS.md]                                                           |
| V3 Session Management | no [VERIFIED: phase requirements]  | No session surface in Phase 2. [VERIFIED: .planning/REQUIREMENTS.md]                                                                |
| V4 Access Control     | no [VERIFIED: phase requirements]  | Vite dev server HMR only; no authorization feature added. [VERIFIED: .planning/ROADMAP.md]                                          |
| V5 Input Validation   | yes [VERIFIED: phase requirements] | Validate/normalize HMR file payloads from module graph URLs; send only source/importer files. [VERIFIED: upstream Qwik Vite plugin] |
| V6 Cryptography       | no [VERIFIED: phase requirements]  | No cryptography in scope. [VERIFIED: .planning/REQUIREMENTS.md]                                                                     |

### Known Threat Patterns for Vite Dev HMR

| Pattern                                                     | STRIDE                                       | Standard Mitigation                                                                                                                                                                                           |
| ----------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Over-broad custom HMR payload causes unintended client work | Denial of Service [ASSUMED]                  | Filter to JS/TS/MDX source/importer URLs and avoid broadcasting unrelated modules. [VERIFIED: upstream Qwik Vite plugin]                                                                                      |
| Dev-only bridge leaks into production output                | Information Disclosure / Tampering [ASSUMED] | Gate bridge injection and loading to Vite serve with `hmr !== false`; Phase 3 verifies no leakage. [VERIFIED: .planning/ROADMAP.md]                                                                           |
| Unsafely interpolated bridge code                           | Tampering [ASSUMED]                          | Keep bridge source static and browser-only; do not embed untrusted source path strings into executable code except JSON-serialized payload data from Vite module graph. [VERIFIED: upstream Qwik Vite plugin] |

## Sources

### Primary (HIGH confidence)

- Vite docs `/vitejs/vite/v8.0.10` via Context7 CLI — `hotUpdate`, `environment.hot.send`, custom events, full reload, and HMR client API. [VERIFIED: Context7 CLI]
- Vite official docs: `https://vite.dev/guide/api-environment-plugins.html`, `https://vite.dev/guide/api-hmr.html`, `https://vite.dev/guide/api-plugin.html`. [CITED: vite.dev]
- Local upstream Qwik Vite plugin: `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/vite.ts` and `plugin.ts`. [VERIFIED: local read]
- Local Qwik core HMR runtime: `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik/src/core/use/use-hmr.ts` and `qrl-class-dev.ts`. [VERIFIED: local read]
- Local project files: `AGENTS.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `src/vite.ts`, `src/dev.ts`, `src/rolldown.ts`, `test/helpers.ts`. [VERIFIED: local read]
- npm registry version checks for `vite`, `@qwik.dev/optimizer`, `rolldown`, `vitest`, `pathe`, and `ufo`. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)

- `.planning/research/SUMMARY.md` — project-level HMR architecture synthesis. [VERIFIED: local read]
- `.planning/phases/02-vite-hmr-transport-and-browser-bridge/02-PATTERNS.md` — local/upstream pattern map for expected files and tests. [VERIFIED: local read]

### Tertiary (LOW confidence)

- Assumption-only warning-sign statements in Common Pitfalls and Security Domain. [ASSUMED]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — versions verified against `package.json` and npm registry. [VERIFIED: package.json] [VERIFIED: npm registry]
- Architecture: HIGH — matches AGENTS constraints, Phase 1 verification, Vite docs, and upstream Qwik plugin. [VERIFIED: AGENTS.md] [CITED: Vite docs] [VERIFIED: upstream Qwik plugin]
- Pitfalls: HIGH for API/behavior pitfalls, MEDIUM for symptom warning signs because some are predictive. [VERIFIED: Vite docs] [ASSUMED]

**Research date:** 2026-05-09 [VERIFIED: system date]  
**Valid until:** 2026-05-16 for Vite HMR API/version details; 2026-06-08 for local architecture constraints if upstream/reference branch remains unchanged. [ASSUMED]
