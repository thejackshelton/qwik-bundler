---
phase: 02-vite-hmr-transport-and-browser-bridge
plan: 03
subsystem: vite-hmr
tags: [vite, hmr, qwik, ssr, transport, vitest]
requires:
    - phase: 01-dev-qrl-segment-core
      provides: environment-scoped dev segment invalidation and hmr:false optimizer gating
    - phase: 02-vite-hmr-transport-and-browser-bridge
      provides: Vite HMR bridge injection, virtual bridge loading, and client update transport
provides:
    - SSR-environment Qwik source update forwarding through the client Vite hot channel
    - hmr:false full-reload fallback for relevant client and SSR source updates
    - Focused TEST-03 and TEST-04 coverage for SSR forwarding and disabled HMR fallback
affects: [02-vite-hmr-transport-and-browser-bridge, phase-03-regression-safety, vite-hmr]
tech-stack:
    added: []
    patterns:
        [
            Vite server reference in HMR helper,
            SSR-to-client hot-channel forwarding,
            hmr:false full-reload fallback,
        ]
key-files:
    created: []
    modified:
        - src/vite/hmr.ts
        - src/vite.ts
        - test/vite-hmr.test.ts
key-decisions:
    - 'Forward SSR-discovered source updates through server.environments.client.hot.send so browser-connected clients receive Qwik HMR events.'
    - 'Use the same source/importer filtering for client and SSR hot updates, and switch only the target Qwik environment and hot channel.'
    - 'Keep hmr:false fallback in the Vite HMR helper so bridge/custom-event paths stay disabled while Vite still performs a full reload.'
patterns-established:
    - 'createViteHmr stores only the minimal Vite server reference needed to reach the client hot channel.'
    - 'Relevant source updates return [] after sending either qwik:hmr or full-reload, preventing unrelated default Vite handling.'
requirements-completed: [GATE-02, GATE-03, TRAN-04, TRAN-05, TRAN-06, TEST-03, TEST-04]
duration: 1min
completed: 2026-05-10
---

# Phase 02 Plan 03: SSR Forwarding and Disabled HMR Fallback Summary

**SSR-discovered Qwik source edits now reach the browser client channel, while `hmr: false` routes relevant updates to Vite full reload without custom Qwik events.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-05-10T03:13:32Z
- **Completed:** 2026-05-10T03:15:27Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added RED coverage for TEST-03 SSR source forwarding and conservative importer fallback behavior.
- Added RED coverage for TEST-04 `hmr: false` full-reload fallback in both client and SSR hot-update paths.
- Implemented SSR-to-client forwarding in `src/vite/hmr.ts`, including server-environment dev segment invalidation and client-channel `qwik:hmr` sends.
- Implemented disabled-HMR full reload fallback with no custom `qwik:hmr` event sends.
- Verified Phase 2 focused tests and production source boundary search.

## task Commits

Each source-changing task was committed atomically:

1. **task 1: test SSR forwarding and disabled full reload behavior**
    - `d3bc94d` test(02-03): add failing SSR and disabled HMR coverage
2. **task 2: implement SSR forwarding and hmr:false fallback**
    - `210e44a` feat(02-03): implement SSR HMR forwarding
3. **task 3: run Phase 2 focused regression gates**
    - No source commit — verification-only task with a clean working tree after gates passed.

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `src/vite/hmr.ts` - Stores a minimal Vite server reference, handles SSR source updates, forwards to the client hot channel, and sends full reloads when HMR is disabled.
- `src/vite.ts` - Delegates `configureServer` to the HMR helper while preserving `rolldownOptions.devServer` for lazy parent transforms.
- `test/vite-hmr.test.ts` - Adds TEST-03 and TEST-04 coverage for SSR forwarding, source importer fallback, and disabled fallback behavior.

## Decisions Made

- Forwarded SSR updates to `server.environments.client.hot.send(...)` instead of the SSR environment hot channel because browser clients are connected to the client environment.
- Reused the existing JS/TS/MDX source/importer filter for SSR and client paths to avoid broadcasting CSS, virtual modules, or unrelated non-source modules.
- Sent `{ type: 'full-reload' }` for relevant updates when `hmr: false`, preserving the existing bridge injection and segment self-accept opt-out path.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Threat Flags

None - the new SSR-to-client hot channel and disabled fallback surfaces were covered by the plan threat model and mitigated through source filtering plus explicit `hmr: false` gating.

## Verification

- `pnpm test test/vite-hmr.test.ts` — failed before implementation with four expected RED failures for SSR forwarding and disabled full-reload behavior.
- `pnpm test test/vite-hmr.test.ts test/vite-plugin.test.ts test/rolldown-runtime.test.ts` — passed (37 tests, 3 files).
- `! rg "@vite/client|entry\.ssr|src/root|preview middleware|createServer" src` — passed with no forbidden production source matches.

## TDD Gate Compliance

- RED gate: `d3bc94d` test(02-03): add failing SSR and disabled HMR coverage.
- GREEN gate: `210e44a` feat(02-03): implement SSR HMR forwarding.

## Self-Check: PASSED

- Verified summary and modified source/test files exist.
- Verified task commits `d3bc94d` and `210e44a` exist in git history.

## Next Phase Readiness

- Phase 2 transport and browser bridge behavior is complete and ready for Phase 3 serve/build gating and regression safety checks.
- No blockers remain for verifying that production, SSR build, library, and static HTML outputs do not leak dev-only HMR code.

---

_Phase: 02-vite-hmr-transport-and-browser-bridge_
_Completed: 2026-05-10_
