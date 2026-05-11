---
phase: 03-serve-build-gating-and-regression-safety
plan: 01
subsystem: testing
tags: [vite, rolldown, hmr, regression-tests]
requires:
    - phase: 02-vite-hmr-transport-and-browser-bridge
      provides: Vite serve-mode HMR bridge and transport behavior
provides:
    - Production Vite build HTML bridge non-injection coverage
    - Vite build/server/library optimizer mode regression coverage
    - Raw Rolldown production/server/library no-HMR-leakage coverage
affects: [phase-03, phase-04, hmr, build-gating]
tech-stack:
    added: []
    patterns: [focused Vitest hook regression tests, HMR forbidden-string gates]
key-files:
    created:
        - .planning/phases/03-serve-build-gating-and-regression-safety/03-01-SUMMARY.md
    modified:
        - test/vite-hmr.test.ts
        - test/vite-plugin.test.ts
        - test/rolldown-runtime.test.ts
key-decisions:
    - 'No source behavior change was needed because the new regression gates pass against the existing serve/build gating.'
patterns-established:
    - 'Build and non-serve contexts assert absence of Qwik HMR bridge/runtime strings.'
requirements-completed: [GATE-04, TEST-08]
duration: 13min
completed: 2026-05-10
---

# Phase 03 Plan 01: Serve/Build Gating Unit Regression Summary

**Focused Vitest gates proving Qwik HMR stays limited to Vite serve and does not leak into build, server, raw Rolldown, or library transform paths.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-05-10T04:29:32Z
- **Completed:** 2026-05-10T04:42:37Z
- **Tasks:** 3
- **Files modified:** 3 test files, 0 source files

## Accomplishments

- Added Vite build-mode HTML coverage asserting `transformIndexHtml` returns `undefined` and no Qwik HMR bridge/runtime strings are present.
- Added Vite optimizer mode coverage for production client builds and strengthened server/library assertions so `mode: 'hmr'` is never selected outside serve HMR.
- Added raw Rolldown runtime coverage proving production client segments, server transforms, and library transforms do not emit dev-only HMR accept/runtime strings.

## Task Commits

No commits were created per user instruction.

## Files Created/Modified

- `test/vite-hmr.test.ts` - Added GATE-04 build-command bridge non-injection regression test.
- `test/vite-plugin.test.ts` - Added production client build optimizer mode gate and shared no-HMR-mode assertion helper.
- `test/rolldown-runtime.test.ts` - Added raw production/server/library no-HMR-leakage tests and shared no-HMR-mode assertion helper.
- `.planning/phases/03-serve-build-gating-and-regression-safety/03-01-SUMMARY.md` - Captures plan execution outcome.

## Decisions Made

- No source behavior change was made; the new tests pass against the existing `serve && options.hmr !== false` and optimizer mode gates.

## Deviations from Plan

None - plan scope was followed. The only issue was a test assertion bug while adding coverage, fixed in the test before final verification.

## Issues Encountered

- Initial `test/vite-hmr.test.ts` run failed because `JSON.stringify(undefined)` produced `undefined`, which is invalid for `toContain`. The assertion was corrected to serialize `tags ?? null`.

## Known Stubs

None.

## Threat Flags

None.

## Verification

- `pnpm test test/vite-hmr.test.ts` — passed, 15 tests.
- `pnpm test test/vite-plugin.test.ts` — passed, 6 tests.
- `pnpm test test/rolldown-runtime.test.ts` — passed, 22 tests.
- `pnpm test test/vite-hmr.test.ts test/vite-plugin.test.ts test/rolldown-runtime.test.ts` — passed, 43 tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Unit-level GATE-04 and TEST-08 coverage is ready for the later fixture artifact leakage checks.

## Self-Check: PASSED

- Created summary file exists.
- Planned test files were updated.
- Plan verification command passed.

---

_Phase: 03-serve-build-gating-and-regression-safety_
_Completed: 2026-05-10_
