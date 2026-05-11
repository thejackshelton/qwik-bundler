---
phase: 03-serve-build-gating-and-regression-safety
plan: 03
subsystem: testing
tags: [hmr, leakage-scan, fixtures, vite, rolldown]
requires:
    - phase: 03-serve-build-gating-and-regression-safety
      provides: Focused Phase 3 serve/build and static HTML regression gates
provides:
    - Deterministic generated fixture artifact scanner for Qwik HMR leakage strings
    - Package script that builds representative fixtures before scanning artifacts
    - Combined Phase 3 regression verification over focused unit tests and fixture outputs
affects: [phase-4-browser-smoke-and-final-verification, test-08, gate-04, gate-05]
tech-stack:
    added: []
    patterns:
        - Static Node 22 ESM scanner over explicit generated output directories
        - Workspace-filter fixture build chain before artifact scanning
key-files:
    created: [scripts/check-hmr-leakage.mjs]
    modified: [package.json]
key-decisions:
    - 'Keep leakage scanning deterministic with static roots and denylist values; no CLI path or pattern arguments are accepted.'
    - 'Run the package build before fixture builds so workspace fixtures resolve current qwik-bundler output.'
patterns-established:
    - 'Fixture leakage gate: build CSR, Nitro, Vite library, and raw Rolldown library outputs before scanning generated artifacts.'
requirements-completed: [GATE-04, GATE-05, TEST-08]
duration: 1min
completed: 2026-05-10
---

# Phase 03 Plan 03: Fixture Build Leakage Gate Summary

**Static fixture artifact scanner with package-level build orchestration for CSR, Nitro, Vite library, and raw Rolldown library HMR leakage checks.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-05-10T04:53:57Z
- **Completed:** 2026-05-10T04:54:48Z
- **Tasks:** 3
- **Files modified:** 2 plan-scope source files plus this summary

## Accomplishments

- Created `scripts/check-hmr-leakage.mjs`, a Node 22 ESM scanner that recursively scans only the explicit generated output roots from the plan.
- Added `pnpm test:hmr-leakage` to run the package build, four representative fixture builds, and the scanner in sequence.
- Verified focused Phase 3 unit gates and fixture artifact leakage checks pass with no forbidden HMR strings found.

## Task Commits

No commits were created per the user's explicit instruction: “do not create git commits, do not push.”

## Files Created/Modified

- `scripts/check-hmr-leakage.mjs` - Deterministic generated artifact scanner for the forbidden Qwik HMR string denylist.
- `package.json` - Adds `test:hmr-leakage` with the exact package/fixture build sequence followed by the scanner.
- `.planning/phases/03-serve-build-gating-and-regression-safety/03-03-SUMMARY.md` - Execution summary for this plan.

## Verification Run

- `node --check scripts/check-hmr-leakage.mjs` — passed.
- `pnpm test:hmr-leakage` — passed; built package, CSR fixture, Nitro fixture, Vite library fixture, raw Rolldown library fixture, then found no forbidden HMR strings.
- `pnpm test test/vite-hmr.test.ts test/vite-plugin.test.ts test/rolldown-runtime.test.ts test/static-html.test.ts && pnpm test:hmr-leakage` — passed; 48 focused tests passed and fixture leakage scan passed.

## Decisions Made

- Kept the scanner argument-free and repo-local to satisfy the plan threat model for static roots and static denylist values.
- Scanned only explicit text-like generated extensions (`.js`, `.mjs`, `.cjs`, `.html`, `.json`, `.css`, `.map`) so ignored fixture outputs are still checked without walking unrelated artifacts.

## Deviations from Plan

None - plan scope was implemented as written. The only process adjustment was skipping commits and state updates because the user explicitly prohibited commits and modifications outside plan scope.

## Known Stubs

None.

## Threat Flags

None. The new filesystem traversal and package-script shell surface are covered by the plan threat model and implemented with static constants only.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 4 can use `pnpm test:hmr-leakage` as the package-level fixture artifact safety gate.
- No blockers found.

## Self-Check: PASSED

- Confirmed `scripts/check-hmr-leakage.mjs`, `package.json`, and the plan file exist.
- Verification commands above passed.

---

_Phase: 03-serve-build-gating-and-regression-safety_
_Completed: 2026-05-10_
