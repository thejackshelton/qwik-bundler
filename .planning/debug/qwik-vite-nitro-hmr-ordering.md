---
status: investigating
trigger: '/gsd-debug Investigate and fix the Qwik Vite/Nitro HMR ordering bug where removing and re-adding a signal-backed button loses or misapplies preserved state. Use the known-good working-hmr branch as a behavioral reference, but keep changes minimal and avoid bridge hacks that reset q:seq or signal state. Return the smallest implementation direction and tests/smokes to run; do not commit.'
created: 2026-05-11
---

# Debug Session: Qwik Vite/Nitro HMR ordering bug

## Current Focus

reasoning_checkpoint:
hypothesis: "Current HMR dispatch ordering is wrong in two places: the bridge dispatches the custom `qwik:hmr` message before Vite's `vite:afterUpdate`, and generated segment self-accept handlers dispatch with stale `document.__hmrT` instead of the current Vite module timestamp. This lets Qwik reconcile remove/re-add updates with stale or duplicate timestamps, losing/misapplying preserved signals."
confirming_evidence: - "`src/hmr/bridge.ts` currently calls `document.dispatchEvent(new CustomEvent('qHmr', ...))` directly inside the `import.meta.hot.on('qwik:hmr')` handler." - "Known-good `working-hmr` bridge queues `qwik:hmr` payloads and only flushes them from a `vite:afterUpdate` listener, demonstrating the behavioral ordering difference." - "`scripts/smoke-vite-nitro-remove-signal-hmr.mjs` reproduces the bug by timing out waiting for `Count 8` after re-adding the signal-backed button." - "New focused unit test fails before the bridge change because `qHmr` is dispatched immediately before any `vite:afterUpdate` payload." - "After only delaying the bridge, the Nitro remove-signal smoke still times out waiting for `Count 8`, so a remaining ordering source exists." - "Known-good segment self-accept computes `t` from `import.meta.url`, updates `document.__hmrT`/`document.__qwikBundlerHmrT`, and guards duplicates; current generated segment accept dispatches `qHmr` with `t:document.__hmrT`, which can be stale during the Vite update."
falsification_test: "If aligning segment self-accept timestamps with Vite's module timestamp plus bridge afterUpdate queueing still does not make the Nitro remove-signal smoke preserve `Count 8`, this hypothesis is wrong or incomplete."
fix_rationale: "The fix makes both Qwik HMR event sources use Vite update ordering: segment self-accepts dispatch using the current module URL timestamp and dedupe guard, while bridge custom payloads wait for `vite:afterUpdate`; no q:seq or signal reset is introduced."
blind_spots: "The unit test models bridge event order but not the full browser module graph; final confidence requires the Nitro Playwright smoke and existing HMR tests."

**next_action:** Update generated segment self-accept code in `src/dev.ts` to use the Vite module timestamp from `import.meta.url`, set `document.__hmrT`/`document.__qwikBundlerHmrT`, and skip duplicate/stale dispatches.

## Evidence

- timestamp: 2026-05-11; source: user; note: Removing and re-adding a signal-backed button loses or misapplies preserved state in Qwik Vite/Nitro HMR.
- timestamp: 2026-05-11; source: user; note: Known-good behavior exists on `working-hmr` branch and should be used as behavioral reference.
- timestamp: 2026-05-11; source: user; note: Avoid bridge hacks that reset `q:seq` or signal state.
- timestamp: 2026-05-11; checked: `src/hmr/bridge.ts`; found: current bridge dispatches `qHmr` immediately when receiving `qwik:hmr`; implication: Qwik may process the HMR event before Vite finishes applying updated segment modules.
- timestamp: 2026-05-11; checked: `working-hmr:src/rolldown.ts`; found: known-good bridge queues `qwik:hmr` payloads and flushes them on `vite:afterUpdate` with a short fallback; implication: reference behavior explicitly orders Qwik reconciliation after Vite's module update cycle.
- timestamp: 2026-05-11; checked: common bug patterns; found: symptom maps to Async/Timing and State Management categories; implication: ordering/race hypothesis should be tested before state-reset workarounds.
- timestamp: 2026-05-11; checked: `pnpm exec node scripts/smoke-vite-nitro-remove-signal-hmr.mjs`; found: smoke timed out waiting for restored `Count 8` after re-adding the signal-backed button; implication: current implementation reproduces the reported Nitro remove/re-add state preservation bug.
- timestamp: 2026-05-11; checked: focused test `dispatches Qwik HMR after Vite applies matching module updates`; found: test fails because `document.dispatchEvent` is called immediately on `qwik:hmr`; implication: the bridge has the exact pre-`vite:afterUpdate` ordering defect.
- timestamp: 2026-05-11; checked: `pnpm test test/vite-hmr.test.ts` after fix; found: 19/19 tests pass, including the new bridge ordering regression test; implication: bridge now waits for Vite's post-update signal before dispatching `qHmr` in the focused model.
- timestamp: 2026-05-11; checked: Nitro remove-signal smoke after bridge-only fix; found: still timed out waiting for restored `Count 8`; implication: bridge ordering is necessary but not sufficient; generated segment self-accept timestamp/order remains suspect.
- timestamp: 2026-05-11; checked: current `src/dev.ts` vs `working-hmr:src/dev.ts`; found: current segment accept dispatches `qHmr` with `t:document.__hmrT`, while known-good computes timestamp from `new URL(import.meta.url).searchParams.get('t')`, writes `document.__hmrT` and `document.__qwikBundlerHmrT`, and skips stale duplicates; implication: current segment accept can dispatch with stale timestamp during the update cycle.

## Specialist Review

## Resolution

root_cause:
Current HMR emits Qwik's `qHmr` with stale/pre-update ordering: the browser bridge dispatches custom `qwik:hmr` immediately instead of after Vite's `vite:afterUpdate`, and generated segment self-accept handlers dispatch with `t:document.__hmrT` rather than the current Vite module timestamp. In Nitro remove/re-add updates, Qwik can reconcile with stale/duplicate timestamps and partially-updated segment code, so preserved signal-backed button state is lost or applied to the wrong DOM shape.
fix:
Queued `qwik:hmr` payloads in `src/hmr/bridge.ts` and flush them from `vite:afterUpdate`, retaining a short fallback flush and the existing post-dispatch reload fallback. Added a focused regression test in `test/vite-hmr.test.ts` that executes the bridge source and verifies `qHmr` is not dispatched until the matching Vite update completes.
