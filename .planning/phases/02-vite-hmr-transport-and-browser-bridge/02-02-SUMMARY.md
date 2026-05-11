---
phase: 02-vite-hmr-transport-and-browser-bridge
plan: 02
subsystem: vite-hmr
tags: [vite, hmr, qwik, transport, vitest]
requires:
    - phase: 01-dev-qrl-segment-core
      provides: generated dev QRL segment invalidation API
    - phase: 02-vite-hmr-transport-and-browser-bridge
      provides: Vite HMR bridge injection and virtual browser bridge module
provides:
    - Client-environment Vite hotUpdate handling for Qwik source edits
    - Generated QRL segment module graph invalidation via invalidateDevSegments
    - Normalized qwik:hmr custom event payloads with importer fallback filtering
affects: [02-vite-hmr-transport-and-browser-bridge, phase-02-plan-03, vite-hmr]
tech-stack:
    added: []
    patterns:
        [
            Vite-specific HMR transport helper,
            source/importer URL filtering,
            graph invalidation boundary,
        ]
key-files:
    created: []
    modified:
        - src/vite/hmr.ts
        - src/vite.ts
        - test/vite-hmr.test.ts
key-decisions:
    - 'Keep Vite module graph invalidation and hot-channel sending in src/vite/hmr.ts so generic dev segment code stays free of Vite internals.'
    - 'Reuse Phase 1 invalidateDevSegments for client source updates and invalidate only returned segment ids before sending qwik:hmr.'
patterns-established:
    - 'Client hotUpdate collects normalized JS/TS/MDX source URLs and falls back to source importers for non-source modules.'
    - 'Vite adapter remains thin by delegating hotUpdate to createViteHmr with the private segment invalidation callback.'
requirements-completed: [GATE-01, TRAN-03, TRAN-05, TRAN-06]
duration: 2min
completed: 2026-05-10
---

# Phase 02 Plan 02: Client HMR Transport Summary

**Client Vite hot updates now invalidate generated QRL segments and send normalized `qwik:hmr` payloads through the browser bridge.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-10T03:09:46Z
- **Completed:** 2026-05-10T03:11:41Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added failing TDD coverage for client `hotUpdate` segment invalidation, timestamped `qwik:hmr` payloads, and source/importer filtering.
- Implemented `src/vite/hmr.ts` client transport that strips query/hash values, invalidates returned segment graph modules, and sends one precise custom event per handled update.
- Wired `src/vite.ts` to delegate `hotUpdate` to the Vite HMR helper while preserving the private `invalidateDevSegments` API on the composed plugin object.
- Verified `src/dev.ts` has no Vite module graph or hot-channel references.

## task Commits

Each task was committed atomically:

1. **task 1: test client hot update invalidation and custom event payloads**
    - `709909a` test(02-02): add failing client HMR transport coverage
2. **task 2: implement client hot-update transport in Vite HMR helper**
    - `98e2c56` feat(02-02): implement client HMR transport

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `src/vite/hmr.ts` - Vite-only HMR helper with source filtering, generated segment invalidation, and client custom event sending.
- `src/vite.ts` - Thin Vite adapter now delegates `hotUpdate` and exposes the private invalidation API alongside `getManifest`.
- `test/vite-hmr.test.ts` - Focused transport coverage for direct source updates and non-source importer fallback behavior.

## Decisions Made

- Kept Vite-specific `moduleGraph` and `hot.send` handling inside `src/vite/hmr.ts` to preserve the Phase 1 generic `src/dev.ts` boundary.
- Used `ufo` `parsePath()` for payload normalization so query/hash stripping follows existing project URL-handling conventions.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The initial RED tests used `.resolves` around a synchronous hook return. The tests still failed before implementation, and the expectation shape was corrected in the GREEN commit while implementing the synchronous Vite hook behavior.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Threat Flags

None - the new client HMR payload and Vite module graph surfaces were covered by the plan threat model and mitigated through source filtering and returned-id invalidation.

## Verification

- `pnpm test test/vite-hmr.test.ts` — failed before implementation with missing `hotUpdate` hook (RED gate).
- `pnpm test test/vite-hmr.test.ts test/vite-plugin.test.ts` — passed (13 tests, 2 files).
- `rg "moduleGraph|hot\.send|ViteDevServer" "src/dev.ts"` — no matches.

## TDD Gate Compliance

- RED gate: `709909a` test(02-02): add failing client HMR transport coverage.
- GREEN gate: `98e2c56` feat(02-02): implement client HMR transport.

## Self-Check: PASSED

- Verified created/modified files exist.
- Verified task commits exist in git history.

## Next Phase Readiness

- Plan 02-03 can extend `src/vite/hmr.ts` for SSR-to-client forwarding and `hmr: false` full-reload fallback.
- Client source updates now provide the browser bridge with the normalized files it needs to dispatch Qwik `qHmr` events.

---

_Phase: 02-vite-hmr-transport-and-browser-bridge_
_Completed: 2026-05-10_
