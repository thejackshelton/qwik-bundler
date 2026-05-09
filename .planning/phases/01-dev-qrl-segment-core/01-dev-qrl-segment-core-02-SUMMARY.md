---
phase: 01-dev-qrl-segment-core
plan: 02
subsystem: bundler-dev-hmr
tags: [qwik, rolldown, vite, hmr, dev-qrl-segments, invalidation, vitest]

requires:
	- 01-dev-qrl-segment-core-01
provides:
	- Environment-scoped dev QRL segment cache coverage for client and server transforms
	- Parent-to-segment invalidation primitive for generated dev segments
	- URL/path normalization for query strings, root-relative paths, absolute paths, and backslash paths
affects: [01-dev-qrl-segment-core, 02-vite-hmr-transport-and-browser-bridge, hmr, dev-segments]

tech-stack:
	added: []
	patterns: [parent-derived segment index, environment-scoped invalidation, centralized dev QRL path normalization]

key-files:
	created:
		- .planning/phases/01-dev-qrl-segment-core/01-dev-qrl-segment-core-02-SUMMARY.md
	modified:
		- test/rolldown-runtime.test.ts
		- src/dev.ts
		- src/rolldown.ts
		- .planning/phases/01-dev-qrl-segment-core/deferred-items.md

key-decisions:
	- 'Expose dev segment invalidation only through a non-public plugin api property for tests and later Vite wiring, without adding a package export.'
	- 'Keep normalization centralized in src/dev.ts using ufo parsePath, pathe normalize, and a small backslash/drive-prefix boundary.'

patterns-established:
	- 'Generated segment aliases are indexed by normalized parent path and Qwik environment before invalidation deletes encoded segment IDs.'
	- 'Dev QRL requests with queries, root-relative paths, absolute paths, and backslash-containing paths resolve to the same recorded segment code.'

requirements-completed: [SEGM-03, SEGM-04, SEGM-06, TEST-06]
duration: 16min 08s
completed: 2026-05-09
---

# Phase 01 Plan 02: Dev QRL Segment Cache Invalidation Summary

**Dev QRL segment caches now stay environment-isolated, can invalidate all aliases derived from a parent source, and normalize common dev URL forms consistently.**

## Performance

- **Duration:** 16min 08s
- **Started:** 2026-05-09T21:58:46Z
- **Completed:** 2026-05-09T22:14:54Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added focused tests proving client and server dev segment IDs remain distinct for the same apparent segment path.
- Added parent invalidation coverage showing stale generated segment code is deleted and a subsequent load re-transforms the parent.
- Implemented a parent-to-segment index in `src/dev.ts` with environment filtering and actual `segments.delete()` cache removal.
- Centralized dev QRL normalization for query stripping, root-relative paths, absolute paths, and backslash-containing paths.

## task Commits

Each task was committed atomically:

1. **task 1: add isolation, invalidation, and normalization tests** - `f9128a3` (test RED)
2. **task 2: implement parent index, invalidation primitive, and normalization boundary** - `61431e1` (feat GREEN)

**Plan metadata:** pending final docs commit

_Note: TDD task 1 intentionally committed the failing RED tests before the implementation commit._

## Files Created/Modified

- `test/rolldown-runtime.test.ts` - Adds hook-level coverage for environment identity, invalidation, and URL/path normalization forms.
- `src/dev.ts` - Adds parent-derived segment indexing, environment-scoped invalidation, and normalization helpers.
- `src/rolldown.ts` - Exposes the dev invalidation primitive through a non-public plugin `api` property for tests and later Vite-specific wiring.
- `.planning/phases/01-dev-qrl-segment-core/deferred-items.md` - Records that `pnpm check` still fails only on the pre-existing `AGENTS.md` formatting issue.

## Decisions Made

- Exposed invalidation as `plugin.api.invalidateDevSegments` for internal/test access rather than adding a package export.
- Kept Vite module graph invalidation and hot-update transport out of Phase 1; this plan only deletes plugin cache entries.
- Used `ufo.parsePath()` plus `pathe.normalize()` and a tiny boundary for backslash/drive-prefix normalization to keep the helper simple and test-backed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `pnpm check` fails on the pre-existing formatting issue in `AGENTS.md`, which this plan did not modify. Per scope-boundary rules, it was logged in `deferred-items.md` and not fixed here.

## Deferred Issues

| Issue                                                  | Scope Decision                                                  | Tracking                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm check` reports formatting issues in `AGENTS.md`. | Out of scope because `AGENTS.md` was not modified by this plan. | `.planning/phases/01-dev-qrl-segment-core/deferred-items.md` |

## Verification

- ✅ `pnpm test test/rolldown-runtime.test.ts`
- ⚠️ `pnpm check` was attempted and failed only on pre-existing `AGENTS.md` formatting.
- ✅ Grep gates for `invalidate(parent`, `segments.delete`, `parsePath`, backslash normalization, `segment:client`, `segment:server`, `v=123`, and `C:\\workspace` were inspected.

## Known Stubs

None.

## Auth Gates

None.

## Threat Flags

None. The plan modified local dev module normalization and in-memory cache invalidation already covered by the plan threat model and did not introduce new endpoints, auth paths, file access patterns, or schema changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2 can call the invalidation primitive from Vite-specific hot-update handling without passing Vite module graph internals into generic dev segment code.
- Browser bridge and custom event transport remain intentionally unwired until the Vite HMR transport phase.

## Self-Check: PASSED

- Found `test/rolldown-runtime.test.ts`, `src/dev.ts`, `src/rolldown.ts`, and this summary file.
- Found task commits `f9128a3` and `61431e1` in git history.

---

_Phase: 01-dev-qrl-segment-core_
_Completed: 2026-05-09_
