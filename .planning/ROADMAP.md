# Roadmap: Qwik Bundler HMR Port

## Overview

This milestone delivers Qwik HMR in Vite serve mode by first making generated dev QRL segments reliable, then wiring Vite transport and the browser bridge, then proving HMR stays gated away from production, SSR/Nitro, static HTML, raw Rolldown, and library outputs. The final phase validates the real browser/fixture behavior and runs the full acceptance checks so maintainers can trust automatic HMR while retaining a clean `hmr: false` opt-out.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Dev QRL Segment Core** - Generated dev QRL segments resolve, load, self-accept, and invalidate correctly across Vite environments.
- [x] **Phase 2: Vite HMR Transport and Browser Bridge** - Vite serve mode injects the Qwik bridge, forwards source updates to the right channel, and supports opt-out reload behavior.
- [x] **Phase 3: Serve/Build Gating and Regression Safety** - HMR remains dev-only and existing CSR, SSR/Nitro, static HTML, raw Rolldown, and library behavior stays intact.
- [ ] **Phase 4: Browser Smoke and Final Verification** - Real fixture/browser checks and final commands prove the HMR port is complete.

## Phase Details

### Phase 1: Dev QRL Segment Core

**Goal**: Maintainers can rely on generated dev QRL segment modules being found, loaded, cached per environment, self-accepted when enabled, and invalidated when parents change.
**Depends on**: Nothing (first phase)
**Requirements**: SEGM-01, SEGM-02, SEGM-03, SEGM-04, SEGM-05, SEGM-06, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):

1. Browser requests for generated dev QRL segment URLs return the correct generated segment for the correct parent source module.
2. A requested segment whose parent was not transformed yet is generated through a narrow parent-transform callback, without exposing Vite server internals to generic segment code.
3. Client and SSR dev segment caches stay isolated, and editing a parent source invalidates all generated segments derived from that parent.
4. Non-worker dev QRL segments include literal `import.meta.hot.accept(` code when HMR is enabled.
5. Focused tests prove segment URL/source normalization, appended accept code, cache invalidation, and parent-transform callback behavior.
   **Plans**: 2 plans

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Implement generated dev QRL segment resolve/load, parent transform callback, and non-worker self-accept code.

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 01-02-PLAN.md — Implement environment-isolated segment caches, parent invalidation primitive, and URL/source normalization coverage.

### Phase 2: Vite HMR Transport and Browser Bridge

**Goal**: Developers using Vite serve get automatic Qwik HMR by default, and developers who set `hmr: false` get a clean full-reload fallback instead.
**Depends on**: Phase 1
**Requirements**: GATE-01, GATE-02, GATE-03, TRAN-01, TRAN-02, TRAN-03, TRAN-04, TRAN-05, TRAN-06, BRDG-01, BRDG-02, BRDG-03, BRDG-04, TEST-01, TEST-02, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):

1. In Vite serve mode with default options, dev HTML receives only the Qwik HMR bridge and never a manual `@vite/client` injection.
2. Vite can resolve and load the virtual Qwik HMR bridge module, and the browser bridge converts Vite `qwik:hmr` events into Qwik `qHmr` events.
3. Client source updates invalidate affected generated segments and send normalized source files to the client HMR channel.
4. SSR-environment source updates forward relevant normalized source files to the client HMR channel, while non-source changes use conservative fallback behavior.
5. With `hmr: false`, bridge injection, dev segment accept code, and custom Qwik HMR events are disabled, and relevant source updates trigger a Vite full reload.
   **Plans**: 3 plans

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Create the bridge virtual module, browser runtime, and serve/default HTML injection coverage.

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 02-02-PLAN.md — Implement client-environment source transport, generated segment invalidation, and precise custom event payloads.

**Wave 3** _(blocked on Wave 2 completion)_

- [x] 02-03-PLAN.md — Implement SSR-to-client forwarding, `hmr: false` full-reload fallback, and focused regression gates.

### Phase 3: Serve/Build Gating and Regression Safety

**Goal**: Maintainers can ship the HMR port without dev-only code leaking into builds or changing existing bundler outputs.
**Depends on**: Phase 2
**Requirements**: GATE-04, GATE-05, TEST-08
**Success Criteria** (what must be TRUE):

1. Production, SSR build, static HTML, raw Rolldown, and library outputs contain no Qwik HMR bridge or generated dev-only HMR code.
2. Static CSR preloader injection remains isolated and unchanged by HMR work.
3. SSR/SSG duplicate-preloader avoidance via `q:render="ssr"` and `q:render="ssr-dev"` remains unchanged.
4. Fixture coverage verifies SSR/Nitro and library builds continue passing without HMR leakage.
   **Plans**: 3 plans

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Add focused build, optimizer-mode, and raw Rolldown no-HMR-leakage regression gates.
- [x] 03-02-PLAN.md — Strengthen static CSR preloader and SSR/SSG duplicate-preloader marker regression gates.

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 03-03-PLAN.md — Add package-level fixture build and artifact leakage scan command for CSR, SSR/Nitro, Vite library, and raw Rolldown library outputs.

### Phase 4: Browser Smoke and Final Verification

**Goal**: Maintainers can verify the completed HMR behavior through practical smoke coverage and the full required command set.
**Depends on**: Phase 3
**Requirements**: TEST-07, TEST-09
**Success Criteria** (what must be TRUE):

1. Practical fixture or browser smoke coverage demonstrates CSR Vite HMR updating a Qwik component in the browser when feasible.
2. Final verification runs focused HMR tests, `pnpm test`, `pnpm check`, `pnpm --filter @fixtures/vite-csr build`, and `pnpm --filter @fixtures/vite-nitro-v3 build` successfully.
   **Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase                                       | Plans Complete | Status      | Completed  |
| ------------------------------------------- | -------------- | ----------- | ---------- |
| 1. Dev QRL Segment Core                     | 2/2            | Complete    | 2026-05-09 |
| 2. Vite HMR Transport and Browser Bridge    | 3/3            | Complete    | 2026-05-10 |
| 3. Serve/Build Gating and Regression Safety | 3/3            | Complete    | 2026-05-10 |
| 4. Browser Smoke and Final Verification     | 0/TBD          | Not started | -          |
