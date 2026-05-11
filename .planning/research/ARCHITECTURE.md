# Architecture Research

**Domain:** Qwik bundler Vite HMR implementation
**Researched:** 2026-05-09
**Confidence:** HIGH for Vite/plugin transport boundaries and upstream behavior; MEDIUM for exact fallback timing because it must be validated in browser fixtures.

## Standard Architecture

### System Overview

Qwik HMR should be a three-part system: generic dev segment handling, Vite-only HMR transport/hooks, and browser bridge runtime. Keep the optimizer/Rolldown layer responsible for producing and loading Qwik dev QRL segments; keep the Vite adapter responsible for Vite server lifecycle, hot-update forwarding, and HTML injection; keep the browser bridge responsible for translating Vite custom events into Qwik's `qHmr` document event.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Vite serve adapter                           │
│  src/vite.ts                                                         │
│  - enables dev mode in configResolved                                │
│  - stores ViteDevServer in configureServer                           │
│  - injects virtual bridge script in transformIndexHtml               │
│  - handles hotUpdate / forwards custom qwik:hmr events               │
└───────────────┬───────────────────────────────────────┬─────────────┘
                │ narrow callbacks / options            │ virtual module + WS
                ▼                                       ▼
┌───────────────────────────────────────┐       ┌──────────────────────┐
│            Dev segment layer           │       │ Browser bridge layer  │
│ src/dev.ts or src/dev/segments.ts       │       │ src/client/hmr-bridge │
│ - parses dev QRL URLs                  │       │ - import.meta.hot.on  │
│ - maps segment id → parent module       │       │ - dispatch qHmr       │
│ - asks callback to transform parent     │       │ - timeout reload      │
│ - returns generated segment code        │       └──────────┬───────────┘
└───────────────┬───────────────────────┘                  │ document event
                │ segment maps                              ▼
                ▼                                  ┌──────────────────────┐
┌───────────────────────────────────────┐          │ Qwik runtime/modules │
│       Rolldown/optimizer plugin        │          │ - QRL segment accept │
│ src/rolldown.ts                        │          │ - component _hmr     │
│ - transformModules(mode: hmr/dev)       │          │ - increments ack     │
│ - records segment metadata/symbols      │          └──────────────────────┘
│ - appends QRL segment self-accept code  │
└───────────────────────────────────────┘
```

### Component Responsibilities

| Component                                                  | Responsibility                                                                                                                                                            | Typical Implementation                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| Vite adapter (`src/vite.ts`)                               | Own Vite-only lifecycle and transport. Set `dev`, capture server, inject bridge, forward SSR/source hot updates to client, full reload when HMR disabled.                 | Thin wrapper around `qwikRolldown`; adds `transformIndexHtml`, virtual module resolution/loading, `configureServer`, and `hotUpdate`. |
| Dev segment loader (`src/dev.ts` or `src/dev/segments.ts`) | Own Qwik dev QRL segment identity. Resolve browser QRL URLs, remember parent modules, trigger parent transform through a narrow callback, return generated segment code.  | Pure TypeScript helper with no Vite imports. Accept `transformParent(environment, parentUrl)` callback instead of `ViteDevServer`.    |
| Optimizer/Rolldown integration (`src/rolldown.ts`)         | Own optimizer transforms, mode selection, segment recording, and generic module loading. Do not know about WebSocket transport.                                           | `transformModules({ mode: 'hmr'                                                                                                       | 'dev' | 'prod', entryStrategy: segment/smart })`; store client/server segment maps keyed by encoded segment id. |
| HMR segment accept code                                    | Make individual generated QRL segments self-accepting Vite HMR boundaries and dispatch a Qwik event for mounted components.                                               | Append literal `import.meta.hot.accept(` code only in Vite dev/HMR mode for non-worker QRL segments.                                  |
| Browser bridge virtual module (`src/client/hmr-bridge.ts`) | Translate custom Vite event `qwik:hmr` into `document.dispatchEvent(new CustomEvent('qHmr', ...))`, dedupe by timestamp, and reload if Qwik runtime does not acknowledge. | Virtual module such as `\0qwik:hmr-bridge` imported from an injected script tag in serve mode only.                                   |
| Qwik runtime/browser event consumer                        | Receives `qHmr`, re-renders affected components, and acknowledges the bridge's timestamp.                                                                                 | Existing Qwik behavior; bundler should only send the expected event payload and not own component rerendering.                        |

## Recommended Project Structure

```
src/
├── dev/
│   ├── segments.ts        # generic dev QRL segment resolution/loading/cache invalidation
│   └── hmr-code.ts        # small helpers that append QRL segment accept code
├── vite/
│   └── hmr.ts             # Vite plugin hooks, virtual bridge id, hot-update forwarding
├── client/
│   └── hmr-bridge.ts      # browser runtime source string or compiled-string entry
├── dev.ts                 # temporary re-export/compat facade if needed
├── vite.ts                # Vite adapter wiring only
└── rolldown.ts            # optimizer, manifest/build artifacts, generic bundler integration
```

### Structure Rationale

- **Keep `src/rolldown.ts` generic:** raw Rolldown should remain build/library/server tooling. It can generate HMR-ready segment code when `options.dev` and HMR are enabled, but it should not send Vite WebSocket messages or depend on `ViteDevServer` types.
- **Keep `src/vite.ts` thin:** Vite owns browser dev/HMR. The adapter should compose the base plugin and delegate HMR details to `src/vite/hmr.ts` rather than growing another upstream-style monolith.
- **Use a real browser bridge module:** upstream currently keeps bridge code inline in `vite.ts`; this rewrite should isolate it so tests can assert the runtime contract without parsing unrelated plugin code.
- **Use narrow callbacks for dev segments:** current `src/dev.ts` already limits the server shape to `transformRequest`. Tighten this further to a callback such as `(environment, parentUrl) => Promise<void>` so generic dev code does not know Vite server internals.

## Architectural Patterns

### Pattern 1: Vite-only transport, generic segment core

**What:** Vite sends custom HMR events and owns environment-specific hot channels; the Qwik segment layer only knows how to resolve/load generated dev segments.

**When to use:** Always for this milestone. Vite's official plugin API supports `hotUpdate` for custom HMR handling and custom events via `environment.hot.send` or server/client hot channels. The browser side should listen with `import.meta.hot.on`.

**Trade-offs:** This creates one extra adapter boundary, but it prevents Vite server state from leaking into Rolldown-only builds.

**Example:**

```typescript
// vite/hmr.ts
export function forwardQwikHotUpdate(ctx: HotUpdateContext, send: QwikHotSender) {
	const files = changedSourceUrls(ctx.modules);
	if (files.length === 0) return;
	send({ type: 'custom', event: 'qwik:hmr', data: { files, t: ctx.timestamp } });
}
```

### Pattern 2: Parent-triggered lazy segment materialization

**What:** A browser may request `/src/component.tsx_symbol_hash.js` before that QRL segment exists in the dev segment map. The segment loader should recover the parent module from the QRL URL, ask Vite to transform the parent, and then load the now-generated segment.

**When to use:** For dev QRL segment `resolveId`/`load` only. This mirrors upstream behavior where `load()` transforms the parent with the dev server if the segment cache is empty.

**Trade-offs:** Lazy materialization is more complex than eager generation, but it matches Vite's unbundled request model and avoids scanning/building every potential QRL segment at startup.

**Example:**

```typescript
// dev/segments.ts
async function loadSegment(id: string) {
	let segment = segments.get(id);
	if (!segment) {
		const parent = parents.get(id);
		if (parent) await transformParent(parent.environment, parent.url);
		segment = segments.get(id);
	}
	return segment?.code ?? null;
}
```

### Pattern 3: Self-accepting generated QRL modules plus bridge event

**What:** Generated QRL segment modules should be HMR boundaries (`import.meta.hot.accept(`), and their accept callback should dispatch `qHmr` for the original parent URL. Separately, server/source updates should be forwarded through `qwik:hmr` to the bridge, which dispatches the same Qwik event.

**When to use:** Append only for Vite serve with HMR enabled, client/browser-safe runtime, and non-`worker$` QRL segments.

**Trade-offs:** The appended accept code couples generated segment code to Vite's HMR static analysis string requirement. Keep it tiny, literal, and tested.

**Example:**

```typescript
code += `
if (import.meta.hot && typeof document !== 'undefined') {
	import.meta.hot.accept(() => {
		document.dispatchEvent(new CustomEvent('qHmr', { detail: { files: [parentUrl], t: document.__hmrT } }));
	});
}`;
```

## Data Flow

### Initial Vite Serve Setup

```
vite configResolved
    ↓
rolldownOptions.dev = true; rootDir = resolved root
    ↓
configureServer
    ↓
Vite adapter stores server or narrow callbacks for transformParent/sendHot
    ↓
transformIndexHtml
    ↓
inject <script type="module" src="/@id/...qwik-hmr-bridge...">
```

### QRL Segment Request Flow

```
Browser imports dev QRL URL
    ↓
Vite resolveId → dev segment resolver parses parent + segment url
    ↓
dev segment resolver records segment id → parent module
    ↓
Vite load → dev segment loader checks segment cache
    ↓ if missing
transformParent(environment, parentUrl) callback asks Vite to transform parent
    ↓
optimizer transform records generated TransformModule in segment map
    ↓
load returns generated segment code + HMR accept code
```

### Source Hot Update Flow

```
File changes on disk
    ↓
Vite hotUpdate per environment
    ↓
Rolldown/dev cache invalidation removes stale segments whose parent changed
    ↓
Vite HMR transport collects source URLs/importer URLs relevant to client Qwik components
    ↓
client hot channel sends { type: 'custom', event: 'qwik:hmr', data: { files, t } }
    ↓
browser bridge import.meta.hot.on('qwik:hmr')
    ↓
document.dispatchEvent(new CustomEvent('qHmr', { detail: data }))
    ↓
Qwik runtime/component HMR rerenders mounted components and acknowledges timestamp
    ↓
bridge reload timeout fires only if update was not acknowledged
```

### Opt-Out / Fallback Flow

```
devTools.hmr === false
    ↓
do not inject Qwik bridge; do not append QRL segment accept code
    ↓
on relevant source hot update, send Vite full-reload instead of qwik:hmr
```

## Suggested Build Order

1. **Extract browser bridge first**
    - Create `src/client/hmr-bridge.ts` (or string-export helper) and virtual module loading in `src/vite/hmr.ts`.
    - Tests: bridge module contains guarded `import.meta.hot`, listens for `qwik:hmr`, dispatches `qHmr`, dedupes timestamp, and reloads on missing acknowledgement.

2. **Harden dev segment loading boundaries**
    - Move or refine current `src/dev.ts` into `src/dev/segments.ts`.
    - Replace broad `devServer` storage with narrow `transformParent` callback if practical.
    - Tests: resolves dev QRL URL, records parent, transforms parent on cache miss, returns `null` when unresolved.

3. **Append QRL segment self-accept code in the optimizer/Rolldown path**
    - Add an HMR-enabled flag separate from generic `dev` if needed (`hmr !== false`).
    - Append accept code only to generated client QRL segment modules in Vite serve/HMR mode.
    - Tests: segment includes literal `import.meta.hot.accept(` when enabled; absent when `hmr: false`, server, lib, or worker segment.

4. **Add Vite hot-update transport**
    - Implement `hotUpdate`/environment-aware forwarding in `src/vite/hmr.ts`.
    - Invalidate stale segment cache before sending events.
    - Forward server-environment source updates to the client hot channel; map non-source modules to JS/TS importers as upstream does.
    - Tests: custom `qwik:hmr` payload for source updates; full reload when disabled; no event for irrelevant modules.

5. **Wire `src/vite.ts` as orchestration only**
    - Compose base plugin + HMR helper hooks without pulling HMR logic into the main adapter.
    - Ensure `hmr: false` is a clean opt-out and existing CSR, SSR/Nitro, and library fixtures still pass.

6. **Add fixture/browser smoke coverage last**
    - CSR Vite HMR: update component source and verify rerender without full reload.
    - SSR/Nitro safety: dev/build behavior should not receive duplicate preload/static HTML changes.

## Anti-Patterns

### Anti-Pattern 1: Passing `ViteDevServer` through generic dev code

**What people do:** Store the entire Vite server object in `src/dev.ts` and use module graph/hot APIs directly from segment loading.

**Why it's wrong:** It couples raw Rolldown/dev segment behavior to Vite internals and violates the project boundary that Vite owns browser HMR.

**Do this instead:** Pass narrow callbacks: `transformParent(environment, parentUrl)`, `invalidateSegment(id)`, and `sendQwikHot(payload)` from the Vite adapter/HMR helper.

### Anti-Pattern 2: Injecting `@vite/client` manually

**What people do:** Add both the Qwik bridge and Vite's client runtime to HTML.

**Why it's wrong:** Vite owns its client injection. Manual injection risks duplicate clients or framework-specific HTML assumptions.

**Do this instead:** Inject only the Qwik HMR bridge in serve mode and rely on Vite for `@vite/client`.

### Anti-Pattern 3: Making HMR part of production/static HTML behavior

**What people do:** Share bridge/preloader/bootstrap injection paths or run HMR logic in build output hooks.

**Why it's wrong:** Static CSR preloader injection is a separate production concern and SSR/SSG HTML must not receive duplicate render-time preload tags.

**Do this instead:** Keep HMR injection in Vite serve `transformIndexHtml`; keep static CSR preloader mutation isolated in `src/build/static-html.ts`.

### Anti-Pattern 4: Relying only on Vite's default propagation

**What people do:** Assume normal ESM HMR propagation will rerender paused/mounted Qwik components.

**Why it's wrong:** Qwik uses generated QRL segments and document-level runtime HMR events. Imports such as styles or server-environment modules may not map directly to the loaded client QRL module.

**Do this instead:** Use generated segment self-accept code plus a custom `qwik:hmr` → `qHmr` browser bridge event.

## Integration Points

### Internal Boundaries

| Boundary                                  | Communication                       | Notes                                                                                                                 |
| ----------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/vite.ts` ↔ `src/vite/hmr.ts`         | Direct helper composition           | `src/vite.ts` should expose resolved root/options/server; `src/vite/hmr.ts` owns virtual bridge and hot update logic. |
| `src/vite/hmr.ts` ↔ `src/dev/segments.ts` | Narrow callbacks                    | HMR helper can provide parent transform and cache invalidation; segment layer should not import `vite`.               |
| `src/rolldown.ts` ↔ `src/dev/segments.ts` | Direct helper calls and segment map | Rolldown records optimizer `TransformModule`s; dev segment loader resolves and loads them.                            |
| Browser bridge ↔ Qwik runtime             | DOM `CustomEvent('qHmr')`           | Stable runtime contract copied from upstream behavior; payload includes `files` and timestamp `t`.                    |
| Vite server ↔ Browser bridge              | Vite custom HMR event `qwik:hmr`    | Prefix event name; send via environment/client hot channel.                                                           |

## Sources

- Local project context: `.planning/PROJECT.md` (2026-05-09), especially requirements to split dev segment loading, Vite transport/hooks, and browser bridge runtime.
- Local upstream Qwik Vite plugin reference: `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/vite.ts` lines 67-97, 654-715. Shows inline bridge virtual module, bridge injection in serve, server hot-update forwarding to `qwik:hmr`, and full reload fallback.
- Local upstream Qwik optimizer/plugin reference: `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/plugin.ts` lines 465-758 and 1119-1143. Shows dev QRL parent recovery, parent transform on cache miss, QRL segment self-accept code, and segment invalidation on hot update.
- Current rewrite code: `src/dev.ts`, `src/vite.ts`, `src/rolldown.ts`. Shows an existing simpler dev segment helper that should be extended rather than replaced with upstream's monolithic structure.
- Vite official docs v8.0.10, Plugin API: `https://vite.dev/guide/api-plugin.html`. Confirms `configureServer`, `transformIndexHtml`, `handleHotUpdate`, custom events, virtual module conventions, and plugin ordering.
- Vite official docs v8.0.10, HMR API: `https://vite.dev/guide/api-hmr`. Confirms guarded `import.meta.hot`, `hot.accept`, `hot.on`, and custom event handling; notes `import.meta.hot.accept(` is statically detected.
- Context7 `/vitejs/vite` docs query for `hotUpdate Environment API client environment hot send custom events`. Confirms current environment-aware `hotUpdate` can send custom events with `this.environment.hot.send`, while legacy `handleHotUpdate` uses `server.ws.send`.

---

_Architecture research for: Qwik bundler Vite HMR implementation_
_Researched: 2026-05-09_
