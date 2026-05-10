---
phase: 04-browser-smoke-and-final-verification
plan: 01
subsystem: testing
tags: [vite, hmr, playwright, browser-smoke, qwik]

requires:
    - phase: 03-serve-build-gating-and-regression-safety
      provides: dev-only HMR gating and focused regression coverage
provides:
    - Playwright-backed CSR Vite browser HMR smoke harness
    - test:hmr-browser package script
    - Browser-verified qHmr component update without post-initial navigation
affects: [phase-04, hmr, vite-serve, browser-verification]

tech-stack:
    added: [playwright]
    patterns:
        - programmatic Vite dev server smoke with finally-restored fixture source
        - browser-side qHmr and navigation instrumentation

key-files:
    created: [scripts/smoke-vite-csr-hmr.mjs]
    modified:
        - package.json
        - pnpm-lock.yaml
        - src/client/hmr-bridge.ts
        - src/features.ts
        - src/vite/hmr.ts
        - test/vite-hmr.test.ts
        - test/rolldown-runtime.test.ts

key-decisions:
    - 'Use Playwright because no browser automation dependency existed in the workspace.'
    - 'Keep the real-browser smoke rooted in fixtures/vite-csr with a temporary source edit restored in finally.'
    - 'Patch the HMR bridge/bootstrap path, after upstream comparison, so CSR client-rendered hosts without inspector attributes can still acknowledge qHmr updates.'

patterns-established:
    - 'Browser smoke scripts should assert DOM update, qHmr observation, no post-initial navigation, and fixture restoration.'
    - 'HMR browser bridge mitigations stay in src/client/hmr-bridge.ts and Vite injection details stay in src/vite/hmr.ts.'

requirements-completed: [TEST-07]

duration: 12min
completed: 2026-05-10
---

# Phase 04 Plan 01: Browser HMR Smoke Summary

**Playwright CSR browser smoke proving Vite serve Qwik HMR updates a component via qHmr without a page reload.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-10T05:24:20Z
- **Completed:** 2026-05-10T05:36:43Z
- **Tasks:** 2
- **Files modified:** 7 plan-owned files plus lockfile

## Accomplishments

- Added `scripts/smoke-vite-csr-hmr.mjs`, which starts `fixtures/vite-csr` with Vite, opens Chromium through Playwright, edits `src/home.tsx`, observes `qHmr`, verifies the `h1` update, rejects post-initial navigations, and restores the fixture in `finally`.
- Added `test:hmr-browser` as `pnpm build && node scripts/smoke-vite-csr-hmr.mjs` and installed Playwright at the workspace root.
- Fixed the browser-discovered CSR HMR gap so Qwik HMR hosts can acknowledge the update and avoid reload fallback.

## Task Commits

No commits were created per explicit user instruction.

## Files Created/Modified

- `scripts/smoke-vite-csr-hmr.mjs` - Playwright-backed browser HMR smoke harness.
- `package.json` - Adds `test:hmr-browser` and root `playwright` dev dependency.
- `pnpm-lock.yaml` - Lockfile update from `pnpm add -Dw playwright`.
- `src/vite/hmr.ts` - Adds a dev-only qInspector bootstrap before the bridge module.
- `src/client/hmr-bridge.ts` - Ensures HMR hosts have an inspector marker before dispatching `qHmr`.
- `src/features.ts` - Defines `globalThis.qInspector` alongside `globalThis.qDev` for dev transforms.
- `test/vite-hmr.test.ts` - Covers the new bridge/bootstrap behavior.
- `test/rolldown-runtime.test.ts` - Covers the new dev qInspector define.

## Decisions Made

- Installed Playwright because no existing browser automation dependency was present.
- Kept smoke ownership in a script rather than a Vitest browser test so it can start/stop the exact fixture Vite server and restore source in `finally`.
- Compared the failure path against upstream `vite.ts` and `plugin.ts`; upstream enables qInspector/HMR support around its Vite integration, so the local fix stays scoped to the HMR bridge/bootstrap owner files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Enabled qInspector before browser HMR rendering**

- **Found during:** task 1 browser smoke.
- **Issue:** The smoke observed that the component did not update in-browser after the source edit. The rendered CSR host lacked the inspector marker Qwik's `_hmr` path checks.
- **Fix:** Added a dev-only qInspector bootstrap in `src/vite/hmr.ts`, a bridge-side host marker fallback in `src/client/hmr-bridge.ts`, and matching focused assertions.
- **Files modified:** `src/vite/hmr.ts`, `src/client/hmr-bridge.ts`, `src/features.ts`, `test/vite-hmr.test.ts`, `test/rolldown-runtime.test.ts`.
- **Verification:** `pnpm test test/vite-hmr.test.ts test/rolldown-runtime.test.ts && pnpm test:hmr-browser`.

**2. [Rule 1 - Bug] Made qHmr observation robust against update timing**

- **Found during:** task 2 combined verification.
- **Issue:** The smoke could read the event array after a successful DOM update but after browser timing had reset the instrumentation.
- **Fix:** Wait for the qHmr event and DOM marker concurrently, then wait briefly to catch forbidden reloads before asserting navigation count.
- **Files modified:** `scripts/smoke-vite-csr-hmr.mjs`.
- **Verification:** `node --check scripts/smoke-vite-csr-hmr.mjs && pnpm test test/vite-hmr.test.ts test/rolldown-runtime.test.ts && pnpm test:hmr-browser && git diff --exit-code -- fixtures/vite-csr/src/home.tsx`.

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both were required for TEST-07 to pass in a real browser without broadening architecture or adding app/router conventions.

## Issues Encountered

- Initial `pnpm add -D playwright` was rejected by pnpm's workspace-root guard; reran as `pnpm add -Dw playwright`.
- The smoke initially timed out waiting for the `h1` update; source comparison with upstream informed the qInspector/HMR bridge fix.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- `scripts/smoke-vite-csr-hmr.mjs` exists.
- `package.json` contains `test:hmr-browser`.
- `git diff --exit-code -- fixtures/vite-csr/src/home.tsx` passed after smoke execution.
- No commits checked because commits were explicitly disabled for this execution.

## Next Phase Readiness

- TEST-07 is covered by an executable browser smoke.
- Phase 04 Plan 02 can run final full-suite/check/fixture verification on top of this smoke.

---

_Phase: 04-browser-smoke-and-final-verification_
_Completed: 2026-05-10_
