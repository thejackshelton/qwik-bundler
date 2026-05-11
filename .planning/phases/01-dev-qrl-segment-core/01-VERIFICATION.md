---
phase: 01-dev-qrl-segment-core
verified: 2026-05-09T23:05:06Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 1: Dev QRL Segment Core Verification Report

**Phase Goal:** Maintainers can rely on generated dev QRL segment modules being found, loaded, cached per environment, self-accepted when enabled, and invalidated when parents change.
**Verified:** 2026-05-09T23:05:06Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                             | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Browser requests for generated dev QRL segment URLs return the correct generated segment for the correct parent source module.                                                    | ✓ VERIFIED | `src/dev.ts:47-56` parses dev QRLs, resolves parent/path, and encodes an environment-scoped segment id; `src/dev.ts:72-80` returns cached generated segment code; `test/rolldown-runtime.test.ts:203-234` verifies transformed segment URL load.                                                                                                        |
| 2   | A requested segment whose parent was not transformed yet is generated through a narrow parent-transform callback, without exposing Vite server internals to generic segment code. | ✓ VERIFIED | `src/dev.ts:6-9` defines only `QwikDevServer.transformRequest`; `src/dev.ts:72-77` calls the callback on cache miss; `src/dev.ts:181-183` maps server→`ssr` and client→`client`; no `ViteDevServer` reference exists in `src/dev.ts`; tests at `test/rolldown-runtime.test.ts:557-595` and `597-608` cover on-demand parent transform.                  |
| 3   | Client and SSR dev segment caches stay isolated.                                                                                                                                  | ✓ VERIFIED | `src/rolldown.ts:400-402` encodes `\0qwik:segment:<environment>:<path>`; `src/dev.ts:88-91` records per-environment ids; `test/rolldown-runtime.test.ts:236-330` verifies client/server ids and loaded code remain distinct for the same apparent segment path.                                                                                         |
| 4   | Editing/invalidating a parent source removes generated segment cache entries derived from that parent.                                                                            | ✓ VERIFIED | `src/dev.ts:28-29` maintains parent indexes; `src/dev.ts:99-106` records parent→segment ids; `src/dev.ts:108-130` deletes matching ids from `segments`; `src/rolldown.ts:99-101` exposes non-public `api.invalidateDevSegments`; `test/rolldown-runtime.test.ts:332-400` verifies old code is removed and a new parent transform supplies updated code. |
| 5   | Non-worker dev QRL segments include literal `import.meta.hot.accept(` code when HMR is enabled.                                                                                   | ✓ VERIFIED | `src/dev.ts:186-197` appends literal `import.meta.hot.accept(` with a document guard; `test/rolldown-runtime.test.ts:446-483` asserts the literal accept wrapper and qHmr payload are present.                                                                                                                                                          |
| 6   | Worker segments and `hmr: false` do not append self-accept code.                                                                                                                  | ✓ VERIFIED | `src/dev.ts:31` gates on `options.hmr !== false`; `src/dev.ts:192-194` skips `worker$` segments; `src/rolldown.ts:313-320` uses optimizer `hmr` mode only when HMR is enabled; tests at `test/rolldown-runtime.test.ts:485-555` cover worker and disabled-HMR negatives.                                                                                |
| 7   | Dev segment URL/source normalization handles query strings, root-relative paths, absolute filesystem paths, and platform separators consistently.                                 | ✓ VERIFIED | `src/dev.ts:149-157` centralizes segment aliases; `src/dev.ts:172-179` strips query/hash, normalizes backslashes, and normalizes drive prefixes; `test/rolldown-runtime.test.ts:402-444` covers `?v=123`, root-relative, absolute, and `C:\\workspace` request forms.                                                                                   |
| 8   | Focused tests prove segment URL/source normalization, appended accept code, cache invalidation, and parent-transform callback behavior.                                           | ✓ VERIFIED | `pnpm test test/rolldown-runtime.test.ts` passed: 1 file, 20 tests, including the phase-specific cases listed above.                                                                                                                                                                                                                                    |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact                        | Expected                                                                                                                    | Status     | Details                                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/dev.ts`                    | Generic dev segment resolver/loader, HMR-gated self-accept append, parent index, invalidation, normalization boundary       | ✓ VERIFIED | Exists and substantive. Exports `QwikDevServer` and `createQwikDev`; wired from `src/rolldown.ts:14` and instantiated at `src/rolldown.ts:96`.                                                  |
| `src/rolldown.ts`               | Optimizer transform recording, environment-scoped ids, non-public invalidation access                                       | ✓ VERIFIED | Exists and substantive. Records optimizer segments at `src/rolldown.ts:325-333`, encodes ids at `src/rolldown.ts:400-402`, and exposes `api.invalidateDevSegments` at `src/rolldown.ts:99-101`. |
| `test/rolldown-runtime.test.ts` | Focused hook-level coverage for segment load, HMR accept code, invalidation, isolation, normalization, and parent callbacks | ✓ VERIFIED | Exists and substantive with direct hook tests; focused test command passed.                                                                                                                     |

### Key Link Verification

| From              | To                               | Via                                             | Status  | Details                                                                                            |
| ----------------- | -------------------------------- | ----------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `src/rolldown.ts` | `src/dev.ts`                     | `resolveId`/`load` delegation                   | ✓ WIRED | `src/rolldown.ts:135-142` delegates resolution and `src/rolldown.ts:218-219` delegates loading.    |
| `src/rolldown.ts` | Optimizer segment cache          | `dev.recordSegment(module, currentEnvironment)` | ✓ WIRED | `src/rolldown.ts:325-333` stores encoded segments and keeps dev parent mappings in sync.           |
| `src/dev.ts`      | `QwikDevServer.transformRequest` | `transformDevParent` fallback                   | ✓ WIRED | `src/dev.ts:181-183` uses environment-specific callback with fallback only to the narrow callback. |
| `src/dev.ts`      | Generated segment code           | `appendSegmentAccept`                           | ✓ WIRED | `src/dev.ts:78-80` applies the append helper on load; `src/dev.ts:186-197` gates worker/HMR cases. |
| Tests             | Implementation hooks             | `callResolveId` / `callLoad` / `callTransform`  | ✓ WIRED | Tests invoke plugin hooks directly and passed under Vitest.                                        |

### Data-Flow Trace (Level 4)

| Artifact                        | Data Variable                       | Source                                                                                           | Produces Real Data | Status    |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------ | --------- |
| `src/dev.ts`                    | `segment` from `segments.get(key)`  | Optimizer output recorded by `src/rolldown.ts:325-333` and `dev.recordSegment`                   | Yes                | ✓ FLOWING |
| `src/dev.ts`                    | `parentSegments` invalidation index | `recordSegment()` derives parent aliases from `parseDevQrl(module.path)` and `devSegmentPaths()` | Yes                | ✓ FLOWING |
| `test/rolldown-runtime.test.ts` | Mock optimizer modules              | Vitest mock `transformModules` returns concrete parent/segment modules                           | Yes                | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior                               | Command                                   | Result                                            | Status                                           |
| -------------------------------------- | ----------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| Focused runtime/dev segment tests pass | `pnpm test test/rolldown-runtime.test.ts` | 1 test file passed, 20 tests passed               | ✓ PASS                                           |
| Project-wide check                     | `pnpm check`                              | Fails formatting on pre-existing `AGENTS.md` only | ⚠️ WARNING — not a Phase 1 artifact/goal blocker |

### Requirements Coverage

| Requirement | Source Plan     | Description                                                                                         | Status      | Evidence                                                                                                                        |
| ----------- | --------------- | --------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| SEGM-01     | `01-01-PLAN.md` | Browser requests for generated dev QRL segment URLs resolve to correct parent and segment identity. | ✓ SATISFIED | `resolveId()` parses/encodes ids in `src/dev.ts:47-56`; test `serves dev QRL segment URLs from transformed output` passes.      |
| SEGM-02     | `01-01-PLAN.md` | Cache-miss segment loader invokes narrow parent-transform callback and returns generated segment.   | ✓ SATISFIED | `src/dev.ts:72-80`, `src/dev.ts:181-183`; tests at `test/rolldown-runtime.test.ts:557-608`.                                     |
| SEGM-03     | `01-02-PLAN.md` | Client and SSR dev segment caches are isolated.                                                     | ✓ SATISFIED | Environment-scoped ids in `src/rolldown.ts:400-402`; isolation test at `test/rolldown-runtime.test.ts:236-330`.                 |
| SEGM-04     | `01-02-PLAN.md` | Editing a parent source invalidates generated QRL segments derived from that parent.                | ✓ SATISFIED | Parent index/invalidation in `src/dev.ts:99-130`; test at `test/rolldown-runtime.test.ts:332-400`.                              |
| SEGM-05     | `01-01-PLAN.md` | Non-worker dev QRL segment modules include literal `import.meta.hot.accept(` when HMR is enabled.   | ✓ SATISFIED | Literal append in `src/dev.ts:196`; positive test at `test/rolldown-runtime.test.ts:446-483`.                                   |
| SEGM-06     | `01-02-PLAN.md` | Dev segment URL/source normalization handles query, root-relative, absolute, and separator cases.   | ✓ SATISFIED | `src/dev.ts:149-179`; normalization test at `test/rolldown-runtime.test.ts:402-444`.                                            |
| TEST-05     | `01-01-PLAN.md` | Unit tests cover dev segment loading with appended HMR accept code.                                 | ✓ SATISFIED | Positive, worker-negative, and hmr-false tests at `test/rolldown-runtime.test.ts:446-555`; focused test command passed.         |
| TEST-06     | `01-02-PLAN.md` | Focused tests verify generated segment invalidation and parent-transform callback behavior.         | ✓ SATISFIED | Invalidation test at `test/rolldown-runtime.test.ts:332-400`; parent-transform tests at `557-608`; focused test command passed. |

No Phase 1 requirement IDs from `.planning/REQUIREMENTS.md` are orphaned: SEGM-01 through SEGM-06 and TEST-05/TEST-06 are all claimed by plans and verified above.

### Anti-Patterns Found

| File                             |     Line | Pattern                                            | Severity   | Impact                                                                              |
| -------------------------------- | -------: | -------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `src/rolldown.ts`                |       64 | TODO comment tied to upstream workaround           | ℹ️ Info    | Existing documented workaround, not a Phase 1 stub or blocker.                      |
| `src/dev.ts` / `src/rolldown.ts` | multiple | `return null` / `return undefined` in plugin hooks | ℹ️ Info    | Normal Rollup/Rolldown “not handled” hook behavior, not stub code.                  |
| `AGENTS.md`                      |      n/a | Formatting failure from `pnpm check`               | ⚠️ Warning | Pre-existing non-phase formatting issue; does not prevent Phase 1 goal achievement. |

### Human Verification Required

None. Phase 1 is generic hook/runtime code with focused automated coverage; browser HMR smoke behavior is explicitly deferred to later roadmap phases.

### Gaps Summary

No blocking gaps found. The implemented code satisfies the Phase 1 roadmap success criteria and all declared Phase 1 requirement IDs. The only observed warning is `pnpm check` failing on pre-existing `AGENTS.md` formatting, outside the Phase 1 implementation artifacts and not a goal-achievement blocker.

---

_Verified: 2026-05-09T23:05:06Z_
_Verifier: OpenCode (gsd-verifier)_
