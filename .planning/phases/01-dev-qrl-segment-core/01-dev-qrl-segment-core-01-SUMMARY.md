---
phase: 01-dev-qrl-segment-core
plan: 01
subsystem: bundler-dev-hmr
tags: [qwik, rolldown, vite, hmr, dev-qrl-segments, vitest]

requires: []
provides:
    - Dev QRL segment load coverage for non-worker self-accept code, worker exclusion, hmr false gating, and on-demand parent transforms
    - Minimal hmr option propagation through QwikRolldownOptions and QwikDevOptions
    - HMR-gated generated segment self-accept code in generic dev segment loading
affects: [01-dev-qrl-segment-core, 02-vite-hmr-transport-and-browser-bridge, hmr, dev-segments]

tech-stack:
    added: []
    patterns: [literal self-accept append, narrow parent transform callback, hmr false opt-out]

key-files:
    created:
        - .planning/phases/01-dev-qrl-segment-core/deferred-items.md
    modified:
        - test/rolldown-runtime.test.ts
        - src/dev.ts
        - src/rolldown.ts

key-decisions:
    - 'Keep Phase 1 self-accept support inside src/dev.ts with a narrow QwikDevServer callback and no Vite server type dependency.'
    - 'Use a minimal top-level hmr?: boolean option so hmr: false disables generated segment self-accept code without adding Phase 2 transport behavior.'

patterns-established:
    - 'Generated dev segment loads append literal import.meta.hot.accept code only when dev and HMR are enabled.'
    - "Worker segments identified by ctxName === 'worker$' return generated code without self-accept wrapping."

requirements-completed: [SEGM-01, SEGM-02, SEGM-05, TEST-05]
duration: 4min 43s
completed: 2026-05-09
---

# Phase 01 Plan 01: Dev QRL Segment Self-Accept Summary

**Dev QRL segment loading now supports HMR-gated literal self-accept wrappers with worker and hmr:false exclusions.**

## Performance

- **Duration:** 4min 43s
- **Started:** 2026-05-09T21:51:53Z
- **Completed:** 2026-05-09T21:56:36Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added focused hook-level tests for non-worker segment self-accept code, worker exclusion, hmr false opt-out, and on-demand parent transforms through `devServer.environments.client.transformRequest`.
- Implemented minimal `hmr?: boolean` gating on dev segment loading while preserving the existing narrow `QwikDevServer` interface.
- Appended Vite-detectable literal `import.meta.hot.accept(` code only for HMR-enabled non-worker generated dev segment modules.

## task Commits

Each task was committed atomically:

1. **task 1: add focused segment load and accept-code tests** - `ebf592c` (test RED)
2. **task 2: implement dev segment self-accept load behavior** - `4bf40f0` (feat GREEN)

**Plan metadata:** pending final docs commit

_Note: TDD task 1 intentionally committed the failing RED tests before the implementation commit._

## Files Created/Modified

- `test/rolldown-runtime.test.ts` - Adds focused unit coverage for literal accept-code append, worker skip, hmr false skip, and parent transform before generated segment load.
- `src/dev.ts` - Adds HMR-enabled gating and appends literal self-accept code for non-worker generated dev segments.
- `src/rolldown.ts` - Exposes the minimal `hmr?: boolean` option used by dev segment loading.
- `.planning/phases/01-dev-qrl-segment-core/deferred-items.md` - Records the out-of-scope pre-existing `AGENTS.md` formatting failure found during `pnpm check`.

## Decisions Made

- Kept the self-accept wrapper local to `src/dev.ts` rather than adding a new HMR module because Phase 1 only needed generated segment load behavior.
- Added `hmr?: boolean` at the existing Rolldown option boundary so tests and later Vite adapter work can use the same opt-out shape.
- Did not add bridge injection, custom HMR event transport, full reload behavior, or Vite server types; those remain Phase 2 scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated legacy exact segment-load assertion for appended dev wrapper**

- **Found during:** task 2 (implement dev segment self-accept load behavior)
- **Issue:** Existing coverage expected generated dev segment load output to equal the raw segment code exactly, which became incorrect once the planned self-accept wrapper was appended.
- **Fix:** Changed the assertion to verify the loaded code still contains the generated segment body.
- **Files modified:** `test/rolldown-runtime.test.ts`
- **Verification:** `pnpm test test/rolldown-runtime.test.ts` passed.
- **Committed in:** `4bf40f0`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** The adjustment was necessary for correctness after the planned behavior change and did not expand scope.

## Issues Encountered

- `pnpm check` fails on a pre-existing formatting issue in `AGENTS.md`, which this plan did not modify. Per scope-boundary rules, it was logged in `deferred-items.md` and not fixed here.

## Deferred Issues

| Issue                                                  | Scope Decision                                                  | Tracking                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm check` reports formatting issues in `AGENTS.md`. | Out of scope because `AGENTS.md` was not modified by this plan. | `.planning/phases/01-dev-qrl-segment-core/deferred-items.md` |

## Verification

- ✅ `pnpm test test/rolldown-runtime.test.ts`
- ⚠️ `pnpm check` was attempted and failed only on pre-existing `AGENTS.md` formatting.

## Known Stubs

None.

## Auth Gates

None.

## Threat Flags

None. The plan modified dev-server module loading behavior already covered by the plan threat model and did not introduce new endpoints, auth paths, file access patterns, or schema changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 1 plan 02 can build on reliable segment loading to add cache isolation, parent invalidation primitives, and normalization coverage.
- Phase 2 can later wire browser bridge/transport behavior without changing the generic dev segment callback boundary.

## Self-Check: PASSED

- Found `test/rolldown-runtime.test.ts`, `src/dev.ts`, `src/rolldown.ts`, and this summary file.
- Found task commits `ebf592c` and `4bf40f0` in git history.

---

_Phase: 01-dev-qrl-segment-core_
_Completed: 2026-05-09_
