---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: ready_to_plan
stopped_at: Completed 02-vite-hmr-transport-and-browser-bridge-03-PLAN.md
last_updated: '2026-05-10T03:16:24.537Z'
last_activity: 2026-05-10
progress:
    total_phases: 4
    completed_phases: 3
    total_plans: 5
    completed_plans: 5
    percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-09)

**Core value:** Vite serve mode supports Qwik HMR automatically, while `hmr: false` cleanly opts out and existing CSR, SSR/Nitro, and library behavior remains intact.
**Current focus:** Phase 02 — vite-hmr-transport-and-browser-bridge

## Current Position

Phase: 3
Plan: Not started
Status: Ready to plan
Last activity: 2026-05-10

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 5
- Total plans completed: 1
- Average duration: 4min 43s
- Total execution time: 0.08 hours

**By Phase:**

| Phase                                       | Plans | Total  | Avg/Plan |
| ------------------------------------------- | ----- | ------ | -------- |
| 1. Dev QRL Segment Core                     | 2/2   | 20m51s | 10m26s   |
| 2. Vite HMR Transport and Browser Bridge    | 0/TBD | N/A    | N/A      |
| 3. Serve/Build Gating and Regression Safety | 0/TBD | N/A    | N/A      |
| 4. Browser Smoke and Final Verification     | 0/TBD | N/A    | N/A      |
| 01                                          | 2     | -      | -        |
| 02                                          | 3     | -      | -        |

**Recent Trend:**

- Last 5 plans: N/A
- Trend: N/A

_Updated after each plan completion_
| Phase 01-dev-qrl-segment-core P02 | 16min 08s | 2 tasks | 4 files |
| Phase 02-vite-hmr-transport-and-browser-bridge P01 | 1min | 3 tasks | 5 files |
| Phase 02-vite-hmr-transport-and-browser-bridge P02 | 2min | 2 tasks | 3 files |
| Phase 02-vite-hmr-transport-and-browser-bridge P03 | 1min | 3 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Use a coarse 4-phase structure matching the natural HMR dependency chain: segment core → Vite transport/bridge → build gating → smoke/final verification.
- Roadmap: Use branch `HMR` and the local upstream Qwik Vite plugin as references, but keep this rewrite simpler unless tests require more complexity.
- Plan 01: Keep generated segment HMR self-accept behavior in `src/dev.ts` with a narrow `QwikDevServer` callback and no Vite server type dependency.
- Plan 01: Use a minimal `hmr?: boolean` option so `hmr: false` disables generated segment self-accept code without adding Phase 2 transport behavior.
- [Phase 01-dev-qrl-segment-core]: Plan 02: Expose dev segment invalidation only through a non-public plugin api property for tests and later Vite wiring, without adding a package export.
- [Phase 01-dev-qrl-segment-core]: Plan 02: Keep normalization centralized in src/dev.ts using ufo parsePath, pathe normalize, and a small backslash/drive-prefix boundary.
- [Phase 02-vite-hmr-transport-and-browser-bridge]: Plan 01: Keep Qwik HMR bridge behavior in src/vite/hmr.ts and src/client/hmr-bridge.ts so src/vite.ts remains a thin adapter.
- [Phase 02-vite-hmr-transport-and-browser-bridge]: Plan 01: Inject only the virtual Qwik bridge script in Vite serve mode and leave @vite/client ownership to Vite.
- [Phase 02-vite-hmr-transport-and-browser-bridge]: Plan 02: Keep Vite module graph invalidation and hot-channel sending in src/vite/hmr.ts so generic dev segment code stays free of Vite internals.
- [Phase 02-vite-hmr-transport-and-browser-bridge]: Plan 02: Reuse Phase 1 invalidateDevSegments for client source updates and invalidate only returned segment ids before sending qwik:hmr.
- [Phase 02-vite-hmr-transport-and-browser-bridge]: Plan 03: Forward SSR HMR through the client hot channel. — Browser clients listen on the client environment channel, so SSR graph discoveries must cross to server.environments.client.hot.send.
- [Phase 02-vite-hmr-transport-and-browser-bridge]: Plan 03: Keep hmr:false full-reload fallback inside the Vite HMR helper. — The helper owns bridge/custom-event gating while preserving Vite's expected full reload behavior when Qwik HMR is disabled.
- [Phase 02-vite-hmr-transport-and-browser-bridge]: Plan 03: Reuse source/importer filtering for client and SSR HMR payloads. — Conservative JS/TS/MDX filtering prevents unrelated CSS, virtual, or non-source modules from being broadcast to the browser.

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2 planning should verify exact Vite 8 environment hot channel type signatures and upstream Qwik event-forwarding details.
- Phase 4 planning may need browser fixture harness research if existing fixture patterns are insufficient.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category   | Item                                                                | Status                                | Deferred At                |
| ---------- | ------------------------------------------------------------------- | ------------------------------------- | -------------------------- |
| Formatting | `pnpm check` reports pre-existing formatting issues in `AGENTS.md`. | Deferred as out-of-scope for plan 01. | 01-dev-qrl-segment-core-01 |

## Session Continuity

Last session: 2026-05-10T03:16:07.299Z
Stopped at: Completed 02-vite-hmr-transport-and-browser-bridge-03-PLAN.md
Resume file: None
