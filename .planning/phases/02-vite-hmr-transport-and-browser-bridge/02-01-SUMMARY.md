---
phase: 02-vite-hmr-transport-and-browser-bridge
plan: 01
subsystem: vite-hmr
tags: [vite, hmr, qwik, browser-bridge, vitest]
requires:
    - phase: 01-dev-qrl-segment-core
      provides: generated dev QRL segment loading and invalidation primitives
provides:
    - Vite serve HTML injection for the Qwik HMR bridge
    - Virtual Qwik HMR bridge module resolution and loading
    - Browser runtime that converts Vite qwik:hmr events into Qwik qHmr events
    - Focused Vite HMR hook and bridge tests
affects: [02-vite-hmr-transport-and-browser-bridge, phase-02-plan-02, phase-02-plan-03]
tech-stack:
    added: []
    patterns: [thin Vite adapter delegation, virtual module bridge, browser-only HMR runtime]
key-files:
    created:
        - src/client/hmr-bridge.ts
        - src/vite/hmr.ts
        - test/vite-hmr.test.ts
    modified:
        - src/vite.ts
        - test/helpers.ts
key-decisions:
    - 'Keep Qwik HMR bridge behavior in src/vite/hmr.ts and src/client/hmr-bridge.ts so src/vite.ts remains a thin adapter.'
    - 'Inject only the virtual Qwik bridge script in Vite serve mode and leave @vite/client ownership to Vite.'
patterns-established:
    - 'Vite HMR helper owns bridge virtual module IDs, HTML injection decisions, and future transport hooks.'
    - 'Browser bridge source is static, browser-only, and loaded through the virtual module boundary.'
requirements-completed:
    [GATE-01, GATE-02, TRAN-01, TRAN-02, BRDG-01, BRDG-02, BRDG-03, BRDG-04, TEST-01, TEST-02]
duration: 1min
completed: 2026-05-10
---

# Phase 02 Plan 01: Vite HMR Bridge Injection Summary

**Vite serve injects a virtual Qwik HMR bridge that dispatches browser qHmr events with timestamp dedupe and fallback reload behavior.**

## Performance

- **Duration:** 1 min for continuation completion; prior partial execution completed tasks 1-2 and RED coverage for task 3.
- **Started:** 2026-05-10T02:52:42Z
- **Completed:** 2026-05-10T02:53:12Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added Vite hook test helpers for `transformIndexHtml`, `configureServer`, and `hotUpdate`.
- Added a browser-only Qwik HMR bridge runtime with `qwik:hmr` listening, duplicate timestamp suppression, `qHmr` dispatch, and reload fallback.
- Added `src/vite/hmr.ts` as the Vite-specific bridge boundary for virtual module resolution/loading and serve-mode HTML injection.
- Wired `src/vite.ts` to delegate bridge injection and virtual module hooks while preserving existing Rolldown/base plugin behavior.
- Verified default serve injection, `hmr: false` non-injection, virtual module loading, and existing Vite plugin compatibility.

## task Commits

Each task was committed atomically:

1. **task 1: add Vite hook test helpers for Phase 2**
    - `2a9dcb0` test(02-01): add failing Vite HMR helper coverage
    - `8c7aba5` feat(02-01): implement Vite HMR hook helpers
2. **task 2: create browser bridge runtime and virtual bridge tests**
    - `91b7f97` test(02-01): add failing virtual bridge coverage
    - `cd50b94` feat(02-01): implement virtual Qwik HMR bridge
3. **task 3: wire bridge injection through the thin Vite adapter**
    - `fa03ffa` test(02-01): add failing Vite bridge injection coverage
    - `4b8c3ac` feat(02-01): wire Vite HMR bridge injection

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `src/client/hmr-bridge.ts` - Static browser bridge source exported for virtual module loading.
- `src/vite/hmr.ts` - Vite-only HMR helper with bridge ID, virtual module load, and serve-mode HTML tag injection.
- `src/vite.ts` - Thin adapter composition for bridge HTML injection and virtual module delegation.
- `test/helpers.ts` - Vite hook invocation helpers used by focused HMR coverage.
- `test/vite-hmr.test.ts` - Focused tests for hook helpers, virtual bridge load, serve injection, and disabled non-injection.

## Decisions Made

- Kept bridge injection and virtual module behavior in `src/vite/hmr.ts` so future Phase 2 transport work can extend the same Vite-specific boundary without moving server internals into `src/dev.ts` or `src/rolldown.ts`.
- Used a single virtual module script tag (`/@id/virtual:qwik-hmr-bridge`) and did not inject `@vite/client`, matching the project requirement that Vite owns its client.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Threat Flags

None - the new dev HTML injection and browser-event bridge surfaces were already covered by the plan threat model.

## Verification

- `pnpm test test/vite-hmr.test.ts test/vite-plugin.test.ts` — passed (11 tests, 2 files).

## Self-Check: PASSED

- Verified created/modified files exist.
- Verified task commits exist in git history.

## Next Phase Readiness

- Plan 02-02 can build on `createViteHmr` to add client-environment source transport and generated segment invalidation.
- Plan 02-03 can extend the same helper for SSR-to-client forwarding and `hmr: false` full-reload transport.

---

_Phase: 02-vite-hmr-transport-and-browser-bridge_
_Completed: 2026-05-10_
