# Requirements: Qwik Bundler HMR Port

**Defined:** 2026-05-09
**Core Value:** Vite serve mode supports Qwik HMR automatically, while `hmr: false` cleanly opts out and existing CSR, SSR/Nitro, and library behavior remains intact.

## v1 Requirements

Requirements for the HMR implementation milestone. Each maps to exactly one roadmap phase.

### Configuration and Gating

- [ ] **GATE-01**: Maintainer can enable Qwik HMR automatically by running the bundler through Vite serve mode with default options.
- [ ] **GATE-02**: Maintainer can set `hmr: false` to disable Qwik HMR bridge injection, dev segment self-accept code, and custom Qwik HMR events.
- [ ] **GATE-03**: Developer receives a Vite full reload for relevant source updates when `hmr: false` is set.
- [ ] **GATE-04**: Production, SSR build, static HTML, raw Rolldown, and library outputs contain no Qwik HMR bridge or generated dev-only HMR code.
- [ ] **GATE-05**: Static CSR preloader injection and SSR/SSG duplicate-preloader avoidance remain unchanged by the HMR implementation.

### Dev QRL Segments

- [x] **SEGM-01**: Browser requests for generated dev QRL segment URLs resolve to the correct parent source module and generated segment identity.
- [x] **SEGM-02**: If a generated QRL segment is requested before its parent has been transformed, the segment loader invokes a narrow parent-transform callback and returns the generated segment.
- [x] **SEGM-03**: Client and SSR dev segment caches are isolated so transforms from one Vite environment cannot overwrite the other.
- [x] **SEGM-04**: Editing a parent source file invalidates all generated QRL segments derived from that parent.
- [x] **SEGM-05**: Non-worker dev QRL segment modules include literal `import.meta.hot.accept(` code when HMR is enabled.
- [x] **SEGM-06**: Dev segment URL and source-path normalization handles query strings, root-relative paths, absolute filesystem paths, and platform path separators consistently.

### Vite HMR Transport

- [ ] **TRAN-01**: Vite serve mode injects only the Qwik HMR bridge module into dev HTML and does not manually inject `@vite/client`.
- [ ] **TRAN-02**: The Vite HMR plugin exposes a virtual Qwik HMR bridge module that can be resolved and loaded by Vite.
- [ ] **TRAN-03**: Source updates in the client environment invalidate affected generated segments and send a `qwik:hmr` custom event with normalized source files.
- [ ] **TRAN-04**: Source updates discovered in the SSR environment forward relevant normalized source file changes to the client HMR channel.
- [ ] **TRAN-05**: Non-source module changes use conservative importer/source fallback behavior instead of broadcasting unrelated updates.
- [ ] **TRAN-06**: The Vite adapter keeps Vite server internals inside Vite-specific HMR code and passes only narrow callbacks to generic dev segment loading.

### Browser Bridge Runtime

- [ ] **BRDG-01**: Browser bridge code listens for Vite `qwik:hmr` custom events and dispatches Qwik's browser `qHmr` event with the update payload.
- [ ] **BRDG-02**: Browser bridge code deduplicates stale or repeated HMR payloads by timestamp.
- [ ] **BRDG-03**: Browser bridge code triggers a full page reload when Qwik does not acknowledge an HMR update within the configured fallback window.
- [ ] **BRDG-04**: Browser bridge runtime remains isolated in a client-facing module rather than embedded across Vite plugin logic.

### Regression and Fixture Coverage

- [ ] **TEST-01**: Unit tests cover Qwik HMR bridge HTML injection and non-injection when disabled.
- [ ] **TEST-02**: Unit tests cover virtual bridge module resolution and loading.
- [ ] **TEST-03**: Unit tests cover SSR/server-environment hot updates forwarding to the client channel.
- [ ] **TEST-04**: Unit tests cover `hmr: false` fallback/full reload behavior.
- [x] **TEST-05**: Unit tests cover dev segment loading with appended HMR accept code.
- [x] **TEST-06**: Focused tests verify generated segment invalidation and parent-transform callback behavior.
- [ ] **TEST-07**: Fixture or browser smoke coverage verifies CSR Vite HMR updates a component in the browser when practical.
- [ ] **TEST-08**: Fixture coverage verifies SSR/Nitro and library builds continue to pass without HMR leakage.
- [ ] **TEST-09**: Final verification runs focused HMR tests, `pnpm test`, `pnpm check`, `pnpm --filter @fixtures/vite-csr build`, and `pnpm --filter @fixtures/vite-nitro-v3 build`.

## v2 Requirements

Deferred to a future milestone unless a v1 test or fixture proves they are required.

### Diagnostics

- **DIAG-01**: Developer can inspect rich HMR diagnostics or dev overlay information for missed Qwik updates.
- **DIAG-02**: Developer receives typed custom-event declarations if the `qwik:hmr` payload contract expands.

### Extended Compatibility

- **COMP-01**: Maintainer can support legacy Vite HMR APIs if a concrete fixture proves compatibility is required.
- **COMP-02**: Maintainer can validate local Qwik library dependency HMR behavior with a dedicated fixture if dependency HMR becomes part of acceptance.
- **COMP-03**: Developer can use advanced `base`, `/@fs/`, or platform-specific path cases beyond the initial helper coverage if real fixture failures require it.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature                                               | Reason                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Manual `@vite/client` injection                       | Vite owns the dev client; injecting it manually risks duplicate clients and app-framework coupling. |
| Raw Rolldown browser dev server HMR                   | Raw Rolldown remains build/library/server tooling; Vite owns the browser HMR feature.               |
| Qwik Router or app-framework entry defaults           | Router/app adapters own conventions such as root, SSR, and preview entry defaults.                  |
| Preview middleware or app-specific path/output wiring | These belong in router/app adapter layers, not the core bundler plugin.                             |
| Static CSR preloader rewrites                         | Preloader and HMR are separate concerns; HMR must not change static HTML production behavior.       |
| Wholesale upstream plugin port                        | The rewrite should port observable behavior while staying simpler and more readable.                |
| Production/library HMR support                        | HMR is a development-server feature and must not leak into stable build outputs.                    |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase   | Status   |
| ----------- | ------- | -------- |
| GATE-01     | Phase 2 | Pending  |
| GATE-02     | Phase 2 | Pending  |
| GATE-03     | Phase 2 | Pending  |
| GATE-04     | Phase 3 | Pending  |
| GATE-05     | Phase 3 | Pending  |
| SEGM-01     | Phase 1 | Complete |
| SEGM-02     | Phase 1 | Complete |
| SEGM-03     | Phase 1 | Complete |
| SEGM-04     | Phase 1 | Complete |
| SEGM-05     | Phase 1 | Complete |
| SEGM-06     | Phase 1 | Complete |
| TRAN-01     | Phase 2 | Pending  |
| TRAN-02     | Phase 2 | Pending  |
| TRAN-03     | Phase 2 | Pending  |
| TRAN-04     | Phase 2 | Pending  |
| TRAN-05     | Phase 2 | Pending  |
| TRAN-06     | Phase 2 | Pending  |
| BRDG-01     | Phase 2 | Pending  |
| BRDG-02     | Phase 2 | Pending  |
| BRDG-03     | Phase 2 | Pending  |
| BRDG-04     | Phase 2 | Pending  |
| TEST-01     | Phase 2 | Pending  |
| TEST-02     | Phase 2 | Pending  |
| TEST-03     | Phase 2 | Pending  |
| TEST-04     | Phase 2 | Pending  |
| TEST-05     | Phase 1 | Complete |
| TEST-06     | Phase 1 | Complete |
| TEST-07     | Phase 4 | Pending  |
| TEST-08     | Phase 3 | Pending  |
| TEST-09     | Phase 4 | Pending  |

**Coverage:**

- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---

_Requirements defined: 2026-05-09_
_Last updated: 2026-05-09 after roadmap creation_
