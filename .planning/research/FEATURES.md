# Feature Research

**Domain:** Qwik Vite HMR integration for `qwik-bundler`
**Researched:** 2026-05-09
**Confidence:** HIGH for Vite/Qwik mechanics verified against local upstream and Vite docs; MEDIUM for prioritization because it is roadmap judgment.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = Qwik apps lose Vite dev parity or silently fall back to page reloads.

| Feature                                                | Why Expected                                                                                                                                              | Complexity | Notes                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Automatic HMR in Vite serve mode                       | Qwik users expect `vite` dev to hot-update components without extra app code. The project context makes this the core value.                              | MEDIUM     | Enable only when Vite command is `serve`; do not require users to import the bridge manually. Upstream forces development entry strategy to `segment` during serve and transforms optimizer mode to `hmr` when `devServer.hot` and `devTools.hmr` are enabled.                                   |
| `hmr: false` opt-out with full reload fallback         | Users need a reliable escape hatch when Qwik HMR is disabled or broken.                                                                                   | LOW        | Treat opt-out as clean: no bridge injection, no self-accept segment code, and server hot updates should trigger a Vite full reload instead of custom `qwik:hmr` events. Project context specifically requires `hmr: false`.                                                                      |
| Qwik HMR browser bridge injection                      | Vite client HMR only knows module boundaries; Qwik needs a browser-level `qHmr` event so resumed/paused components can re-render.                         | MEDIUM     | Inject a tiny virtual module/script only in Vite serve mode. It should listen for a namespaced Vite custom event such as `qwik:hmr`, dedupe by timestamp, dispatch `CustomEvent('qHmr', { detail })`, and reload if the update is not acknowledged. Do not inject `@vite/client`; Vite owns it.  |
| Dev QRL segment resolution                             | Qwik event handlers/effects are split into generated QRL segment modules that do not exist on disk. Vite must resolve browser requests for those modules. | HIGH       | Resolve dev segment URLs of the form `<parent>_<symbol>.js`, normalize root-relative and absolute forms, map them back to a parent source module, and mark them side-effect-free. This is already partially represented in `src/dev.ts`; HMR needs the same mapping to be invalidated correctly. |
| Lazy parent transform when segment requested first     | Browser may request a generated QRL segment before its parent module has been transformed in the current dev graph.                                       | MEDIUM     | If a segment is missing, transform the parent through the correct Vite environment using a narrow callback/server adapter, then load the generated segment. This avoids passing Vite internals through generic dev code while preserving upstream behavior.                                      |
| Per-environment transformed segment caches             | Vite 6+ runs hot updates per environment; Qwik has different client and SSR transforms. Mixing them breaks QRL code and invalidation.                     | HIGH       | Keep client and server segment state separate. Current rewrite should prefer explicit environment keys over ad-hoc `ssr` booleans. Vite docs state `hotUpdate` runs for each environment and `this.environment` scopes the module graph.                                                         |
| Segment invalidation on parent update                  | Editing a parent source file must invalidate its generated QRL segment modules; otherwise the browser can keep stale handlers.                            | HIGH       | On hot update, remove generated segments whose parent id matches the changed module and invalidate their Vite module graph nodes. Upstream does this in `createQwikPlugin.hotUpdate`.                                                                                                            |
| Self-accept code in dev QRL segments                   | Vite considers a module hot-updatable only if static analysis sees `import.meta.hot.accept(` in the source.                                               | MEDIUM     | Append guarded self-accept code to loaded dev segments when HMR is enabled. On accept, dispatch `qHmr` with the parent file path. Exclude segment kinds that should not be browser-accepted, such as upstream's `worker$` exclusion.                                                             |
| Server-to-client forwarding for SSR source updates     | In SSR/Nitro dev, source files often live in the SSR environment graph while the browser needs to update loaded client QRL segments.                      | HIGH       | In `hotUpdate`, when `this.environment.name === 'ssr'`, collect changed source URLs and send a custom `qwik:hmr` payload over the client environment HMR channel. For non-source transformed imports, forward JS/TS importers rather than the synthetic asset URL.                               |
| Full reload when browser update is not acknowledged    | Qwik HMR can miss changes if the active DOM/code no longer matches the updated segment set. Users expect correctness over stale UI.                       | MEDIUM     | Bridge should reload after a short timeout if Qwik did not mark the update done. This matches project context and upstream bridge behavior using `document.__hmrT` / `document.__hmrDone`.                                                                                                       |
| Source URL normalization and filtering                 | HMR payload file paths must match optimizer `devPath` and Qwik runtime expectations.                                                                      | MEDIUM     | Use root-relative POSIX URLs for files under the Vite root; strip query strings; only send source-like JS/TS/MDX URLs or their JS importers. Prefer `ufo`/`pathe` helpers already used by this repo over hand-rolled path logic.                                                                 |
| Preserve existing CSR, SSR/Nitro, and library behavior | HMR must not regress production builds, server bundles, static HTML preloader injection, or library mode.                                                 | HIGH       | Scope HMR features to Vite serve mode. Raw Rolldown remains build/library/server tooling. Avoid static CSR preloader coupling. Add fixture-backed coverage for CSR serve and SSR/Nitro safety.                                                                                                   |
| Focused test coverage for HMR seams                    | HMR has multiple hidden state transitions; missing tests invite stale segment and reload regressions.                                                     | MEDIUM     | Minimum tests: bridge injection, virtual module resolve/load, parent transform callback, hot-update forwarding, opt-out full reload, self-accept code, source URL normalization, and no build/static HTML regressions.                                                                           |

### Differentiators (Competitive Advantage)

Features that set this rewrite apart. Not all are required for parity, but they are valuable because the rewrite's stated goal is simpler, more maintainable Qwik bundling.

| Feature                                        | Value Proposition                                                                                          | Complexity | Notes                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clear HMR responsibility split                 | Maintainers can reason about segment loading, Vite hooks, and browser runtime independently.               | MEDIUM     | Recommended split: `src/dev/segments.ts` or current `src/dev.ts` for segment resolution/loading, `src/vite/hmr.ts` for Vite hot-update transport and bridge injection, `src/client/hmr-bridge.ts` for browser code. This is a project requirement, not upstream's current monolithic shape. |
| Narrow adapter boundary for Vite server access | Keeps generic Rolldown/dev code testable and avoids leaking Vite-specific module graph objects everywhere. | MEDIUM     | Generic dev code should accept callbacks like `transformParent(environment, parentUrl)` and `invalidateSegment(environment, id)` rather than a full `ViteDevServer`. Current `QwikDevServer` is already a good starting point but can be narrowed further.                                  |
| Minimal bridge with explicit event contract    | Reduces mystery global state and lets tests assert behavior without booting a full app.                    | LOW        | Document payload shape: `{ files: string[]; t: number }`; bridge listens to `qwik:hmr`; browser dispatches `qHmr`. Keep `document.__hmrT/__hmrDone` compatibility if Qwik runtime expects it, but isolate the globals in one file.                                                          |
| Environment-aware HMR using Vite's current API | Avoids stale pre-Vite-6 assumptions and better fits Vite 8/Rolldown-powered Vite.                          | MEDIUM     | Prefer `this.environment`, `environment.moduleGraph`, and `server.environments.client.hot.send` where available, with compatibility only if tests prove older API support is required.                                                                                                      |
| Testable URL/path helpers                      | HMR bugs often come from path/query/base differences; small helpers make edge cases visible.               | LOW        | Unit-test parse/normalize helpers for `?v=`, `/@fs/`, base-prefixed URLs, absolute paths, Windows separators, and root-relative parent paths.                                                                                                                                               |
| Conservative source/importer forwarding        | Better correctness than blasting every changed module to the browser.                                      | MEDIUM     | Follow upstream's source URL detection and importer fallback, but keep it as a named helper with tests. This should reduce unnecessary reloads and make style/inline import updates work.                                                                                                   |
| Readability over upstream breadth              | The rewrite can deliver the same observable HMR behavior with less incidental plugin complexity.           | LOW        | Do not port unrelated upstream devtools, preview middleware, router defaults, image size server, or external dependency scanning as part of the HMR milestone unless a failing fixture requires it.                                                                                         |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem useful but create unnecessary coupling or violate this milestone's boundaries.

| Feature                                             | Why Requested                                                      | Why Problematic                                                                                                                                                         | Alternative                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Manual `@vite/client` injection                     | It looks like a quick way to ensure browser HMR connects.          | Vite owns client injection; adding it risks duplicates and framework-specific HTML assumptions. Project context explicitly marks this out of scope.                     | Inject only the Qwik bridge in serve mode and rely on Vite's normal dev client.                      |
| Raw Rolldown browser dev server                     | Would make HMR available outside Vite.                             | Large new product surface; duplicates Vite's dev server, module graph, and WebSocket semantics. Project context says raw Rolldown remains build/library/server tooling. | Implement browser HMR only through the Vite adapter.                                                 |
| Router/app entry defaults in bundler HMR            | Router examples often assume `src/root.tsx`, `src/entry.ssr`, etc. | Core bundler must remain target-agnostic; router/app adapters own entry conventions.                                                                                    | Use configured Vite/Rolldown inputs and transformed module graph; leave app defaults to adapters.    |
| Static CSR preloader changes as part of HMR         | Both touch dev/build HTML and Qwik client boot behavior.           | Preloader and HMR are different concerns; coupling risks duplicate preload/bootstrap tags and SSR marker regressions.                                                   | Keep static CSR preloader logic isolated in `src/build/static-html.ts`; HMR only injects dev bridge. |
| Port upstream Vite plugin wholesale                 | Upstream works and has many edge cases.                            | It includes broader concerns than this rewrite wants, making the new bundler harder to read and maintain.                                                               | Port observable HMR behavior only, with smaller helpers and fixture-driven additions.                |
| Global mutable HMR state spread across plugin files | Quick to implement by copying upstream globals.                    | Hidden coupling makes duplicate/stale update bugs hard to trace.                                                                                                        | Centralize runtime globals in the bridge and server-side maps in segment/HMR modules.                |
| HMR in production builds or library mode            | Developers may ask for consistent behavior everywhere.             | HMR is a dev-server feature; production/library transforms need stable chunks and manifests, not hot state.                                                             | Disable HMR code outside Vite serve; keep library mode inline/production behavior unchanged.         |
| Broad compatibility branches without tests          | Helps support unknown older Vite variants.                         | Adds complexity and can mask real Vite 6+/8 environment API behavior.                                                                                                   | Add compatibility only for a proven fixture or failing test.                                         |

## Feature Dependencies

```text
Automatic Vite serve HMR
    ├──requires──> Qwik HMR browser bridge injection
    │                  └──requires──> Vite custom HMR event contract (`qwik:hmr` -> `qHmr`)
    ├──requires──> Dev QRL segment resolution
    │                  ├──requires──> Source URL normalization
    │                  └──requires──> Lazy parent transform when segment requested first
    ├──requires──> Per-environment transformed segment caches
    │                  └──requires──> Segment invalidation on parent update
    ├──requires──> Self-accept code in dev QRL segments
    └──requires──> Server-to-client forwarding for SSR source updates
                           └──requires──> Vite environment-aware hotUpdate handling

`hmr: false` opt-out
    └──conflicts──> Bridge injection and segment self-accept code
    └──requires──> Full reload fallback

Clear responsibility split
    └──enhances──> Test coverage, narrow Vite server adapter, and maintainability
```

### Dependency Notes

- **Bridge injection requires Vite custom events:** Vite's client API supports `import.meta.hot.on(event, cb)` for plugin-defined events; Qwik needs that event translated into the runtime's `qHmr` browser event.
- **Segment self-accept requires static `import.meta.hot.accept(`:** Vite documentation states the accept call is statically analyzed and whitespace-sensitive, so generated segment code must contain the direct call shape.
- **SSR forwarding requires environment-aware handling:** Vite's current `hotUpdate` runs per environment. Qwik source updates in the SSR graph need explicit client-channel forwarding or the browser will not know to re-render loaded QRL segments.
- **Opt-out conflicts with bridge/self-accept:** If HMR is disabled, leaving partial HMR code active creates confusing no-op updates. Use full reload instead.
- **Source normalization underpins everything:** The optimizer `devPath`, Vite module URL, hot-update payload, and Qwik runtime file list must all refer to the same logical source file.

## MVP Definition

### Launch With (v1)

Minimum viable HMR parity for this milestone.

- [ ] Automatic Vite serve HMR with `hmr !== false` default — validates the project core value.
- [ ] `hmr: false` full reload fallback — required escape hatch and explicit project requirement.
- [ ] Qwik HMR bridge virtual module/script injection — required to connect Vite's HMR channel to Qwik runtime re-rendering.
- [ ] Dev QRL segment resolve/load with lazy parent transform — required for browser-requested QRL segments that do not exist on disk.
- [ ] Per-environment segment caches and parent invalidation — required to avoid stale client/server segment code.
- [ ] Self-accept code appended to non-worker dev QRL segments — required for Vite to treat generated segments as HMR boundaries.
- [ ] SSR-environment source update forwarding to client HMR channel — required for SSR/Nitro dev parity.
- [ ] Focused unit tests for bridge, virtual module, hot-update forwarding, opt-out reload, and self-accept code — required before implementation per project rules.

### Add After Validation (v1.x)

Features to add once core HMR works in fixtures.

- [ ] Browser smoke fixture for CSR HMR — add after unit seams pass to catch integration regressions.
- [ ] SSR/Nitro smoke coverage for safe forwarding and no production regressions — add once the HMR transport is implemented.
- [ ] More path/base edge cases (`/@fs/`, custom `base`, Windows paths) — add when tests reveal gaps or fixtures need them.
- [ ] Typed custom event declarations for `qwik:hmr` — useful DX if the event contract grows, but not needed for runtime parity.

### Future Consideration (v2+)

Features to defer until the HMR rewrite is stable.

- [ ] Rich HMR diagnostics/dev overlay integration — defer unless users cannot debug missed updates with existing logs/tests.
- [ ] Granular runtime acknowledgement protocol beyond `document.__hmrDone` — defer until Qwik core exposes a cleaner public contract.
- [ ] Cross-framework adapter-specific HMR entry conventions — belongs in router/meta-framework adapters, not core bundler.

## Feature Prioritization Matrix

| Feature                               | User Value | Implementation Cost | Priority |
| ------------------------------------- | ---------- | ------------------- | -------- |
| Automatic Vite serve HMR              | HIGH       | MEDIUM              | P1       |
| `hmr: false` opt-out/full reload      | HIGH       | LOW                 | P1       |
| Qwik HMR bridge injection             | HIGH       | MEDIUM              | P1       |
| Dev QRL segment resolution/load       | HIGH       | HIGH                | P1       |
| Lazy parent transform                 | HIGH       | MEDIUM              | P1       |
| Per-environment segment caches        | HIGH       | HIGH                | P1       |
| Segment invalidation on parent update | HIGH       | HIGH                | P1       |
| Self-accept code in segments          | HIGH       | MEDIUM              | P1       |
| SSR-to-client hot-update forwarding   | HIGH       | HIGH                | P1       |
| Source URL normalization/filtering    | HIGH       | MEDIUM              | P1       |
| Clear responsibility split            | MEDIUM     | MEDIUM              | P1       |
| Narrow Vite adapter boundary          | MEDIUM     | MEDIUM              | P1       |
| CSR browser smoke fixture             | HIGH       | MEDIUM              | P2       |
| SSR/Nitro smoke fixture               | HIGH       | MEDIUM              | P2       |
| Typed custom event declarations       | LOW        | LOW                 | P3       |
| Rich HMR diagnostics                  | MEDIUM     | MEDIUM              | P3       |

**Priority key:**

- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor / Reference Feature Analysis

| Feature                        | Local upstream Qwik Vite plugin                                                                               | Current rewrite baseline                                                                 | Recommended rewrite approach                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Bridge runtime                 | Inline `@qwik-hmr-bridge` virtual module listens to `qwik:hmr`, dispatches `qHmr`, reloads if unacknowledged. | No dedicated HMR bridge found.                                                           | Keep behavior but move code to a small client bridge module and inject only in serve mode.               |
| Dev segment resolution/loading | Resolves parent-derived QRL URLs, records `parentIds`, transforms parent if segment is requested first.       | `src/dev.ts` already resolves dev QRLs and can transform parent through `QwikDevServer`. | Extend current simpler model for HMR invalidation and self-accept while narrowing the server callback.   |
| Optimizer mode                 | Uses optimizer `mode: 'hmr'` when dev server hot is active and HMR is enabled.                                | Uses `mode: 'dev'` whenever `options.dev` is enabled.                                    | Use `hmr` mode for HMR-enabled Vite serve if optimizer requires it; verify with focused transform tests. |
| Segment self-accept            | Appends `import.meta.hot.accept` to generated QRL segments except `worker$`.                                  | Not present.                                                                             | Add in dev load path, isolated and tested.                                                               |
| Hot update invalidation        | Deletes transformed segment outputs whose parent changed and invalidates graph nodes.                         | Not present.                                                                             | Add a Vite HMR module that coordinates invalidation with segment state.                                  |
| SSR forwarding                 | In `hotUpdate`, when environment is `ssr`, sends client custom event with changed files/importers.            | Not present.                                                                             | Implement as table-stakes for SSR/Nitro parity.                                                          |
| Opt-out                        | Upstream uses `devTools.hmr ?? true`; disabled path sends full reload.                                        | Project requires `hmr: false`, but option shape not yet implemented.                     | Add explicit option and ensure disabled mode is simple/full reload.                                      |

## Sources

- Local project context: `.planning/PROJECT.md` — HIGH confidence for scope, out-of-scope items, and required tests.
- Local upstream Qwik Vite plugin: `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/vite.ts` — HIGH confidence for bridge injection, custom event forwarding, opt-out reload behavior, and SSR/client environment forwarding.
- Local upstream Qwik plugin core: `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/plugin.ts` — HIGH confidence for dev QRL resolution, parent transform, optimizer HMR mode, segment self-accept code, and segment invalidation.
- Current rewrite code: `src/dev.ts`, `src/vite.ts`, `src/rolldown.ts` — HIGH confidence for existing baseline and separation constraints.
- Vite HMR API docs: `https://vite.dev/guide/api-hmr` (v8.0.10 docs fetched 2026-05-09) — HIGH confidence for `import.meta.hot`, custom event listening, and static `accept` requirements.
- Vite Plugin API docs: `https://vite.dev/guide/api-plugin.html#handlehotupdate` (v8.0.10 docs fetched 2026-05-09) — HIGH confidence for plugin HMR custom events and full reload handling.
- Vite Environment API for Plugins: `https://vite.dev/guide/api-environment-plugins.html` (v8.0.10 docs fetched 2026-05-09) — HIGH confidence for per-environment `hotUpdate`, `this.environment`, and `environment.hot` patterns.

---

_Feature research for: Qwik Vite HMR integration_
_Researched: 2026-05-09_
