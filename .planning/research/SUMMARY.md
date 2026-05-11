# Project Research Summary

**Project:** Qwik Bundler HMR Port  
**Domain:** Qwik HMR support in a Vite plugin / bundler integration  
**Researched:** 2026-05-09  
**Confidence:** HIGH

## Executive Summary

This project is a focused Qwik bundler rewrite milestone: add production-quality Qwik HMR to the Vite adapter without turning the core bundler into an app framework or a Vite clone. Experts build this as a layered system, not as ordinary ESM HMR: Qwik's optimizer extracts `$` closures into lazy QRL segment modules, Vite owns the browser dev server and HMR transport, and a small browser bridge translates Vite custom events into Qwik's runtime-level `qHmr` document event.

The recommended approach is to keep HMR strictly scoped to Vite serve mode and split responsibilities clearly: generic dev QRL segment resolution/loading in the dev layer, optimizer/Rolldown transforms and segment recording in `src/rolldown.ts`, Vite-only bridge injection and `hotUpdate` forwarding in a Vite HMR helper, and browser runtime code in a tiny bridge module. Use Vite 8's environment-aware APIs (`hotUpdate`, `this.environment`, environment module graphs, and client hot channels), and preserve raw Rolldown, production build, SSR build, static HTML, and library behavior unchanged.

The largest risks are stale generated QRL segment caches, forwarding SSR changes to the wrong HMR environment, leaking dev-only code into production/library outputs, and path-shape mismatches between optimizer `devPath`, Vite URLs, and browser payloads. Mitigate them with literal segment `import.meta.hot.accept(` code, root-relative URL normalization via `ufo`/`pathe`, parent-to-segment invalidation, explicit SSR-to-client forwarding, a first-class `hmr: false` full-reload branch, and fixture-backed regression checks for CSR, SSR/Nitro, library, and static HTML behavior.

## Key Findings

### Recommended Stack

Use the local stack already present in the project. No new runtime dependencies are recommended. The implementation should lean on Vite's current environment-aware HMR APIs and the existing Qwik optimizer instead of introducing a websocket runtime, custom dev server, or hand-written QRL parser.

**Core technologies:**

- **Vite `^8.0.10`**: browser dev server and HMR runtime — owns `@vite/client`, module graph invalidation, HTML dev handling, and custom HMR event transport.
- **Vite Environment API / `hotUpdate`**: per-environment HMR handling — required because Qwik source updates may be discovered in SSR while browser QRL segments must update through the client channel.
- **`@qwik.dev/optimizer@2.1.0-beta.2`**: Qwik semantic transforms and QRL segment generation — keep Qwik-specific parsing and transform semantics in the optimizer; use HMR mode only when Vite serve HMR is enabled.
- **Rolldown `^1.0.0-rc.18`**: build/library/server bundler integration — preserve it for production and non-browser-dev workflows; do not make raw Rolldown own HMR transport.
- **TypeScript `^5.9.3` and Node `>=22`**: implementation/test baseline — avoid compatibility branches unless backed by a fixture.
- **`ufo` and `pathe`**: URL and path normalization — preferred for dev QRL URL parsing, query stripping, and root-relative `devPath` generation.
- **Vitest, with optional Playwright smoke tests**: use focused unit tests first, then browser/fixture smoke coverage for CSR and SSR/Nitro once seams are implemented.

Critical version/API requirements: prefer Vite `hotUpdate(ctx)` over legacy `handleHotUpdate`, send custom events through environment hot channels rather than `server.ws.send` as the primary path, and append literal `import.meta.hot.accept(` text in generated segment modules because Vite statically scans for that syntax.

### Expected Features

The MVP is Vite serve HMR parity for Qwik's generated QRL segments while preserving the core bundler's separation of concerns. The feature set is tightly coupled: bridge injection, segment resolution, segment self-acceptance, cache invalidation, source URL normalization, and SSR-to-client forwarding all have to land for HMR to feel correct.

**Must have (table stakes):**

- Automatic HMR in Vite serve mode, enabled by default.
- Explicit `hmr: false` opt-out with client full-reload fallback.
- Qwik HMR browser bridge virtual module injected only in Vite serve.
- Dev QRL segment resolution/loading, including lazy parent transform when a segment is requested first.
- Per-environment segment caches so client and SSR transforms cannot overwrite each other.
- Parent-update segment invalidation and Vite module graph invalidation.
- Literal self-accept code in non-worker dev QRL segments.
- SSR-environment source update forwarding to the client HMR channel.
- Source URL normalization/filtering to root-relative JS/TS/MDX-style paths.
- Focused test coverage for bridge, virtual module, hot-update forwarding, opt-out reload, self-accept code, and segment loading.

**Should have (competitive):**

- Clear HMR responsibility split across dev segments, Vite transport, and browser bridge.
- Narrow adapter boundary for Vite server access instead of passing `ViteDevServer` through generic code.
- Minimal, documented event contract: Vite `qwik:hmr` payload `{ files: string[]; t: number }` becomes browser `qHmr`.
- Testable URL/path helpers for query, base, absolute, root-relative, and platform path edge cases.
- Conservative source/importer forwarding to avoid blasting every module change to the browser.
- CSR and SSR/Nitro browser/fixture smoke tests after unit seams pass.

**Defer (v2+):**

- Rich HMR diagnostics or dev overlay integration.
- A more granular runtime acknowledgement protocol beyond upstream-compatible `document.__hmrT` / `document.__hmrDone`.
- Cross-framework/router-specific HMR entry defaults.
- Raw Rolldown browser dev server support.
- Broad legacy Vite compatibility branches without fixtures.

### Architecture Approach

Implement HMR as a three-part system: generic dev segment handling, Vite-only HMR transport/hooks, and browser bridge runtime. `src/vite.ts` should stay thin and compose helpers; `src/rolldown.ts` should continue owning optimizer transforms, manifests, build artifacts, and output hooks; static HTML production helpers should remain untouched except for regression tests.

**Major components:**

1. **Vite adapter / HMR helper** — resolve serve-mode HMR state, inject the virtual bridge, handle `hotUpdate`, forward SSR source changes to the client hot channel, and send full reload when disabled.
2. **Dev segment loader** — parse QRL dev URLs, map segment IDs to parent modules, invoke a narrow parent-transform callback on cache miss, load generated segment code, and support targeted invalidation.
3. **Optimizer/Rolldown integration** — call optimizer transforms with the correct mode, record generated segment metadata by environment, and append HMR self-accept code only for Vite serve client segments.
4. **Browser bridge virtual module** — listen for Vite `qwik:hmr`, dedupe by timestamp, dispatch `CustomEvent('qHmr')`, and reload if Qwik does not acknowledge the update.
5. **Qwik runtime consumer** — remains outside the bundler; the bundler only sends the expected `qHmr` event payload.

Key patterns: use Vite-only transport with a generic segment core; lazily materialize segments by transforming the parent when needed; make generated QRL modules self-accepting while relying on the bridge for document-level Qwik rerender events; gate all HMR behavior to Vite serve plus `hmr !== false`.

### Critical Pitfalls

1. **Treating Qwik HMR like ordinary module self-acceptance** — avoid by combining segment self-accept code with the `qwik:hmr` → `qHmr` bridge; Vite acceptance alone does not rerender paused/resumed Qwik components.
2. **Sending events from the wrong Vite environment** — avoid by implementing `hotUpdate` in Vite-only code, invalidating the current environment graph, and explicitly forwarding SSR-discovered source updates to `server.environments.client.hot`.
3. **Failing to invalidate stale optimizer segment caches** — avoid by tracking parent IDs for every generated segment, deleting affected segments on parent edits, and invalidating Vite module graph nodes before reloading.
4. **Mis-resolving dev QRL segment URLs** — avoid by centralizing path/query/base normalization with `ufo`/`pathe`, preserving parent/importer fallback resolution, and keeping environment-specific segment keys.
5. **Leaking HMR into production, SSR build, static HTML, or library mode** — avoid by gating on Vite serve and `hmr !== false`; verify production/library output contains no bridge or `import.meta.hot` strings.
6. **Breaking `hmr: false` fallback** — avoid by disabling bridge/self-accept code completely and sending client full reloads for relevant updates.
7. **Duplicating Vite's client runtime or coupling to static CSR preloader code** — avoid by injecting only the Qwik bridge in dev HTML and leaving `src/build/static-html.ts` isolated.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Dev Segment Core and HMR Code Foundation

**Rationale:** Generated QRL segment identity, parent mapping, environment-specific cache storage, and literal self-accept code are prerequisites for every higher-level HMR behavior. Without this phase, Vite can send events but the browser may still load stale or missing segment modules.  
**Delivers:** Refined `src/dev.ts` or `src/dev/segments.ts`, narrow parent-transform callback, root-relative URL normalization helpers, parent-to-segment indexing, cache invalidation primitives, and tested HMR accept-code generation.  
**Addresses:** Dev QRL segment resolution, lazy parent transform, per-environment caches, segment self-accept code, source URL normalization.  
**Avoids:** Ordinary module-HMR assumption, stale segment caches, dev QRL URL mis-resolution, client/server segment overwrites.  
**Research flag:** Standard patterns; no extra research needed unless optimizer `mode: 'hmr'` type behavior is unclear during implementation.

### Phase 2: Vite HMR Transport and Browser Bridge

**Rationale:** Once segments can be resolved and invalidated, Vite must notify the correct browser runtime. This phase wires the Vite 8 environment API, SSR-to-client forwarding, bridge injection, and full reload fallback.  
**Delivers:** Vite HMR helper module, virtual bridge ID/load/resolve, dev-only `transformIndexHtml` bridge injection, `hotUpdate` implementation, custom `qwik:hmr` payload sending, `hmr: false` full-reload branch, and tests for forwarding/opt-out/duplicate suppression.  
**Uses:** Vite `hotUpdate`, `this.environment`, `server.environments.client.hot.send`, `import.meta.hot.on`, and Vite-managed `@vite/client`.  
**Implements:** Vite adapter/HMR helper and browser bridge components.  
**Avoids:** Wrong environment transport, duplicate Vite client injection, missing acknowledgement fallback, broken opt-out behavior.  
**Research flag:** Needs targeted implementation research against local upstream Qwik plugin and Vite 8 types while planning this phase; APIs are documented but exact local type signatures and optimizer payload shape should be verified.

### Phase 3: Serve/Build Gating and Regression Safety

**Rationale:** HMR must not regress production builds, SSR/Nitro output, static CSR preloader behavior, or Qwik library mode. This should follow core transport so tests can assert absence of dev-only code across real outputs.  
**Delivers:** Strict Vite-serve/HMR-enabled gating, build/library/static HTML regression tests, no-HMR snapshots, SSR/Nitro safety checks, dependency no-external/optimizeDeps preservation audit, and `hmr: false` fixture coverage.  
**Addresses:** Preserve CSR, SSR/Nitro, and library behavior; full reload opt-out; anti-feature boundaries.  
**Avoids:** HMR leakage into builds, static CSR preloader/SSR marker regressions, duplicate client runtime, Qwik dependency pre-bundling/externalization mistakes.  
**Research flag:** Standard patterns for build gating; targeted research only if a fixture reveals Qwik dependency/library HMR behavior that differs from upstream.

### Phase 4: Browser Smoke Fixtures and Edge-Case Hardening

**Rationale:** Unit tests cover seams, but Qwik HMR correctness depends on browser runtime acknowledgement and real Vite client behavior. Browser smoke coverage should come after core implementation to validate observable behavior without slowing early iteration.  
**Delivers:** CSR Vite HMR smoke test, SSR/Nitro edit forwarding smoke test, unacknowledged-update reload test, path/base/query edge cases (`/@fs/`, custom `base`, Windows-like separators where practical), and optional local Qwik library dependency fixture.  
**Addresses:** Browser-level rerender without reload, fallback reload correctness, edge-case path normalization, dependency/library HMR safety.  
**Avoids:** Looks-done-but-isn't failures where unit seams pass but browser Qwik components remain stale.  
**Research flag:** Needs deeper research only for Playwright/browser harness setup or local Qwik library fixture behavior; otherwise standard Vite/Qwik fixture patterns apply.

### Phase Ordering Rationale

- Build the segment core first because HMR transport depends on accurate parent/segment mapping and invalidation.
- Add Vite transport second because forwarding and bridge behavior can only be correct once the server knows which generated segments are stale.
- Validate build/SSR/library/static HTML boundaries before declaring the feature complete because the project explicitly prioritizes preserving existing CSR, SSR/Nitro, and library fixture behavior.
- Add browser smoke tests last to confirm real runtime behavior and catch acknowledgement/fallback issues that unit tests cannot fully prove.
- Keep router/app defaults, preview middleware, raw Rolldown dev server, and static CSR preloader changes out of every HMR phase unless a failing fixture proves interaction.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 2:** Verify exact Vite 8 type signatures, environment hot channel usage, and upstream Qwik event-forwarding details before implementation.
- **Phase 4:** Research/confirm browser fixture harness and any Qwik library dependency HMR fixture requirements.

Phases with standard patterns (skip research-phase unless blocked):

- **Phase 1:** Segment resolution/loading patterns are documented in local current code and upstream Qwik references.
- **Phase 3:** Build gating and regression testing are standard repository practices; use existing fixture conventions.

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                                                                            |
| ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stack        | HIGH       | Local package versions, upstream Qwik plugin behavior, and Vite 8 docs align strongly. Only optimizer `mode: 'hmr'` type details should be verified during implementation.                       |
| Features     | HIGH       | Table-stakes features map directly to project requirements, upstream Qwik behavior, and Vite HMR docs. Prioritization is MEDIUM judgment but the required feature set is clear.                  |
| Architecture | HIGH       | Three-layer split matches project rules, current code boundaries, upstream reference behavior, and Vite's Environment API. Exact browser timeout behavior is MEDIUM until fixture-validated.     |
| Pitfalls     | HIGH       | Critical risks are grounded in upstream Qwik code, Vite docs, local architecture constraints, and known generated-QRL behavior. Qwik runtime internals not exposed as public docs remain MEDIUM. |

**Overall confidence:** HIGH

### Gaps to Address

- **Optimizer HMR mode details:** Verify whether `@qwik.dev/optimizer@2.1.0-beta.2` exposes/accepts `mode: 'hmr'` exactly as upstream uses it; handle with a focused transform test during Phase 1.
- **Browser acknowledgement timing:** Upstream-style timeout is recommended, but exact reload timing should be validated in Phase 4 browser smoke tests.
- **Path/base edge cases:** Root-relative and query stripping are clear, but `base`, `/@fs/`, and Windows-like paths should be covered by helper tests before expanding compatibility logic.
- **Qwik library dependency HMR:** Preserve existing dedupe/no-external behavior initially; add a local `.qwik` library fixture if dependency HMR or externalization behavior becomes part of acceptance.
- **SSR/Nitro real-world parity:** Unit-test SSR-to-client forwarding in Phase 2, then validate with SSR/Nitro fixture coverage before completion.

## Sources

### Primary (HIGH confidence)

- `.planning/research/STACK.md` — stack recommendations, versions, Vite Environment API guidance, and what not to use.
- `.planning/research/FEATURES.md` — table-stakes HMR features, differentiators, anti-features, MVP, and dependency graph.
- `.planning/research/ARCHITECTURE.md` — component boundaries, data flow, build order, and anti-patterns.
- `.planning/research/PITFALLS.md` — critical pitfalls, phase mapping, recovery strategies, and verification checklist.
- Local upstream Qwik Vite plugin: `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/vite.ts` — bridge, injection, `hotUpdate`, SSR-to-client forwarding, full reload fallback.
- Local upstream Qwik optimizer/plugin internals: `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/plugin.ts` — dev QRL resolution/loading, optimizer HMR mode, segment self-accept code, and invalidation.
- Current rewrite files: `src/dev.ts`, `src/vite.ts`, `src/rolldown.ts`, `src/build/static-html.ts` — local baseline and separation constraints.
- Vite official docs v8.0.10 — HMR API, Plugin API, Environment API, custom events, `hotUpdate`, and static `import.meta.hot.accept(` behavior.
- Qwik official docs — QRL model, optimizer `$` extraction, Vite usage, and library output expectations.

### Secondary (MEDIUM confidence)

- Context7 Vite and Rolldown docs lookups — corroborate Vite environment custom-event patterns and Rolldown plugin behavior; Rolldown HMR relevance is intentionally limited because Vite owns browser HMR.
- Qwik docs Vite page — confirms Qwik uses Vite for fast dev and HMR, but appears older than local upstream plugin details for `devTools.hmr`.

---

_Research completed: 2026-05-09_  
_Ready for roadmap: yes_
