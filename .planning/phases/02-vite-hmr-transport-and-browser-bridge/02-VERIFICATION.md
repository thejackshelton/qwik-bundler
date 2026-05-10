---
phase: 02-vite-hmr-transport-and-browser-bridge
verified: 2026-05-10T03:32:40Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 2: Vite HMR Transport and Browser Bridge Verification Report

**Phase Goal:** Developers using Vite serve get automatic Qwik HMR by default, and developers who set `hmr: false` get a clean full-reload fallback instead.
**Verified:** 2026-05-10T03:32:40Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                           | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | In Vite serve mode with default options, dev HTML receives only the Qwik HMR bridge and never a manual `@vite/client` injection.                                | ✓ VERIFIED | `src/vite.ts:41-52` sets `serve` from Vite config and delegates `transformIndexHtml`; `src/vite/hmr.ts:63-73` returns one module script for `virtual:qwik-hmr-bridge` when enabled. `test/vite-hmr.test.ts:59-95` asserts default serve injection, configured base handling, disabled non-injection, and no `@vite/client`. Production source grep found no `@vite/client` matches.                                                                                                                                                                 |
| 2   | Vite can resolve and load the virtual Qwik HMR bridge module, and the browser bridge converts Vite `qwik:hmr` events into Qwik `qHmr` events.                   | ✓ VERIFIED | `src/vite/hmr.ts:6-9` defines bridge IDs, `src/vite/hmr.ts:75-84` resolves/loads the virtual module from `QWIK_HMR_BRIDGE_SOURCE`; `src/client/hmr-bridge.ts:3-21` listens to `import.meta.hot.on('qwik:hmr')`, dedupes timestamps, dispatches `CustomEvent('qHmr')`, and reloads on missing acknowledgement. Tests at `test/vite-hmr.test.ts:35-57` and `97-107` cover direct/helper and composed plugin paths.                                                                                                                                    |
| 3   | Client source updates invalidate affected generated segments and send normalized source files to the client HMR channel.                                        | ✓ VERIFIED | `src/vite/hmr.ts:85-126` handles client updates; `src/vite/hmr.ts:97-123` collects normalized files, calls `invalidateDevSegments(file, 'client')`, invalidates returned graph modules, and sends `{ type: 'custom', event: 'qwik:hmr', data: { files, t } }`. Tests at `test/vite-hmr.test.ts:292-333` verify segment invalidation and normalized payloads.                                                                                                                                                                                        |
| 4   | SSR-environment source updates forward relevant normalized source files to the client HMR channel, while non-source changes use conservative fallback behavior. | ✓ VERIFIED | `src/vite/hmr.ts:90-91` routes SSR sends through `server.environments.client.hot`; `src/vite/hmr.ts:130-132` maps SSR to Qwik server invalidation; `src/vite/hmr.ts:134-160` filters source files and importer fallbacks. Tests at `test/vite-hmr.test.ts:110-198` verify SSR source forwarding, importer fallback, and no unrelated CSS/virtual payloads.                                                                                                                                                                                          |
| 5   | With `hmr: false`, bridge injection, dev segment accept code, and custom Qwik HMR events are disabled, and relevant source updates trigger a Vite full reload.  | ✓ VERIFIED | `src/vite.ts:25-30` enables HMR only for serve and `options.hmr !== false`; `src/vite/hmr.ts:63-66` disables bridge injection, `src/vite/hmr.ts:92-95` sends `{ type: 'full-reload' }` and returns before custom events when disabled. Dev segment accept is gated by `src/dev.ts:31` and `src/dev.ts:192-197`; optimizer mode is gated by `src/rolldown.ts:313-320`. Tests at `test/vite-hmr.test.ts:89-95`, `200-290`, and `test/rolldown-runtime.test.ts:478/517/553` cover non-injection, full reload, no `qwik:hmr`, and disabled accept code. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact                   | Expected                                                                                            | Status     | Details                                                                                                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/client/hmr-bridge.ts` | Browser-only Qwik HMR bridge runtime                                                                | ✓ VERIFIED | Exists and substantive. Exports `QWIK_HMR_FALLBACK_MS` and static bridge source with `import.meta.hot.on`, `qHmr` dispatch, timestamp dedupe, and reload fallback. Wired via `src/vite/hmr.ts:3` and `load()` at `src/vite/hmr.ts:82-84`.                                        |
| `src/vite/hmr.ts`          | Vite bridge virtual module, HTML injection, hot-update transport, SSR forwarding, disabled fallback | ✓ VERIFIED | Exists and substantive. Owns Vite-specific server reference, virtual module IDs, bridge injection, source filtering, module graph invalidation, custom event sends, SSR client-channel forwarding, and full-reload fallback. Wired from `src/vite.ts:7` and `src/vite.ts:25-30`. |
| `src/vite.ts`              | Thin Vite adapter composition and option propagation                                                | ✓ VERIFIED | Delegates HMR behavior to `createViteHmr`, preserves `rolldownOptions.dev`, `rootDir`, `devServer`, and `hmr` option path. No router/default dev-server behavior added.                                                                                                          |
| `test/helpers.ts`          | Hook callers for Vite HTML/server/hot-update tests                                                  | ✓ VERIFIED | Exports `callTransformIndexHtml`, `callConfigureServer`, and `callHotUpdate`; covered by `test/vite-hmr.test.ts:14-33`.                                                                                                                                                          |
| `test/vite-hmr.test.ts`    | Focused Phase 2 tests                                                                               | ✓ VERIFIED | Contains bridge injection/resolution/loading, client transport, SSR forwarding, source/importer fallback, and `hmr:false` full reload coverage. Focused test command passed.                                                                                                     |

### Key Link Verification

| From                       | To                                     | Via                                        | Status  | Details                                                                                                                                                        |
| -------------------------- | -------------------------------------- | ------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/vite.ts`              | `src/vite/hmr.ts`                      | `createViteHmr` composition                | ✓ WIRED | Import at `src/vite.ts:7`; helper instance at `src/vite.ts:25-30`; hooks delegate at `src/vite.ts:47-76`.                                                      |
| `src/vite/hmr.ts`          | `src/client/hmr-bridge.ts`             | virtual module load returns bridge source  | ✓ WIRED | `QWIK_HMR_BRIDGE_SOURCE` imported at `src/vite/hmr.ts:3` and returned for resolved ID at `src/vite/hmr.ts:82-84`.                                              |
| `src/client/hmr-bridge.ts` | browser `document`                     | `CustomEvent('qHmr')` dispatch             | ✓ WIRED | Bridge source dispatches `document.dispatchEvent(new CustomEvent('qHmr', { detail: data }))` at `src/client/hmr-bridge.ts:14`.                                 |
| `src/vite/hmr.ts`          | `basePlugin.api.invalidateDevSegments` | client/SSR hot-update invalidation         | ✓ WIRED | `src/vite.ts:28-29` passes private API callback; `src/vite/hmr.ts:103-106` invokes it per source file.                                                         |
| `src/vite/hmr.ts`          | Vite module graph                      | returned segment ID invalidation           | ✓ WIRED | `src/vite/hmr.ts:106-116` finds returned segment modules and calls `invalidateModule(module, invalidated, timestamp, true)`.                                   |
| `src/vite/hmr.ts`          | client hot channel                     | custom `qwik:hmr` and disabled full reload | ✓ WIRED | `src/vite/hmr.ts:90-95` selects client/SSR target channel and sends full reload when disabled; `src/vite/hmr.ts:119-123` sends custom Qwik event when enabled. |
| `src/vite.ts`              | `src/dev.ts`                           | `hmr` option propagation                   | ✓ WIRED | `rolldownOptions` clones user options in `src/vite.ts:14`; `src/dev.ts:31` and `src/dev.ts:192-197` use `options.hmr !== false` to gate segment accept code.   |

### Data-Flow Trace (Level 4)

| Artifact                   | Data Variable | Source                                                                                                      | Produces Real Data                                                                                                          | Status    |
| -------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| `src/vite/hmr.ts`          | `files`       | `sourceFiles(ctx.modules ?? [])` from Vite `hotUpdate` context                                              | Yes — filters actual Vite module URLs/importers and strips query/hash with `parsePath`                                      | ✓ FLOWING |
| `src/vite/hmr.ts`          | `segmentIds`  | `options.invalidateDevSegments(file, hmrEnvironment(environment))` supplied by composed Rolldown plugin API | Yes — Phase 1 dev segment cache invalidation returns concrete segment IDs; tests verify IDs reach module graph invalidation | ✓ FLOWING |
| `src/client/hmr-bridge.ts` | `data`        | Vite browser HMR custom event `qwik:hmr`                                                                    | Yes — Vite helper sends timestamped `{ files, t }` payloads; bridge dispatches same payload as `qHmr` detail                | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior                                            | Command                                                                                                       | Result                               | Status |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------ |
| Focused Phase 2 HMR/unit regression coverage        | `pnpm test test/vite-hmr.test.ts test/vite-plugin.test.ts test/rolldown-runtime.test.ts`                      | 3 test files passed; 39 tests passed | ✓ PASS |
| Production source boundary search                   | `grep`/content search for `@vite/client`, router defaults, preview middleware, raw `createServer` under `src` | No forbidden matches                 | ✓ PASS |
| Vite internals boundary in generic dev segment code | content search for `moduleGraph`, `hot.send`, `ViteDevServer` in `src/dev.ts`                                 | No matches                           | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan  | Description                                                                                       | Status      | Evidence                                                                                                                           |
| ----------- | ------------ | ------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GATE-01     | 02-01, 02-02 | Enable Qwik HMR automatically in Vite serve default options.                                      | ✓ SATISFIED | Serve/default `transformIndexHtml` injects bridge when `options.hmr !== false`; tests cover default injection and transport sends. |
| GATE-02     | 02-01, 02-03 | `hmr: false` disables bridge injection, dev segment self-accept code, and custom Qwik HMR events. | ✓ SATISFIED | `src/vite/hmr.ts:63-66`, `92-95`; `src/dev.ts:31`, `192-197`; tests assert no injection/no custom events/no accept code.           |
| GATE-03     | 02-03        | Developer receives Vite full reload for relevant source updates when `hmr: false` is set.         | ✓ SATISFIED | `src/vite/hmr.ts:92-95`; tests at `test/vite-hmr.test.ts:200-290` verify client and SSR full reload.                               |
| TRAN-01     | 02-01        | Inject only Qwik bridge into dev HTML and no manual `@vite/client`.                               | ✓ SATISFIED | `src/vite/hmr.ts:68-72`; tests assert tag shape and no `@vite/client`; source search found no forbidden injection.                 |
| TRAN-02     | 02-01        | Expose virtual Qwik HMR bridge module resolvable/loadable by Vite.                                | ✓ SATISFIED | `src/vite/hmr.ts:75-84`; tests verify resolve/load.                                                                                |
| TRAN-03     | 02-02        | Client updates invalidate generated segments and send normalized files.                           | ✓ SATISFIED | `src/vite/hmr.ts:97-123`; tests verify invalidation and `/src/root.tsx` normalized payload.                                        |
| TRAN-04     | 02-03        | SSR updates forward relevant normalized files to client HMR channel.                              | ✓ SATISFIED | `src/vite/hmr.ts:90-91`, `119-123`; tests verify `server.environments.client.hot.send` and not SSR hot channel.                    |
| TRAN-05     | 02-02, 02-03 | Non-source module changes use conservative importer/source fallback.                              | ✓ SATISFIED | `src/vite/hmr.ts:134-160`; client and SSR importer fallback tests exclude CSS/raw/virtual URLs.                                    |
| TRAN-06     | 02-02, 02-03 | Vite server internals stay inside Vite-specific HMR code and narrow callbacks go to dev segments. | ✓ SATISFIED | `moduleGraph`/`hot.send` only in Vite helper/tests, not `src/dev.ts`; `src/dev.ts` keeps narrow `QwikDevServer.transformRequest`.  |
| BRDG-01     | 02-01        | Bridge listens for Vite `qwik:hmr` and dispatches Qwik `qHmr`.                                    | ✓ SATISFIED | `src/client/hmr-bridge.ts:6` and `14`; virtual module test checks both strings.                                                    |
| BRDG-02     | 02-01        | Bridge deduplicates stale/repeated payloads by timestamp.                                         | ✓ SATISFIED | `src/client/hmr-bridge.ts:7-13`; test checks `data.t === document.__hmrT`.                                                         |
| BRDG-03     | 02-01        | Bridge reloads if Qwik does not acknowledge within fallback window.                               | ✓ SATISFIED | `src/client/hmr-bridge.ts:15-19`; test checks acknowledgement comparison and `location.reload()`.                                  |
| BRDG-04     | 02-01        | Bridge runtime remains isolated in a client-facing module.                                        | ✓ SATISFIED | Runtime is in `src/client/hmr-bridge.ts`; Vite helper imports static source instead of embedding bridge logic in `src/vite.ts`.    |
| TEST-01     | 02-01        | Unit tests cover bridge HTML injection and disabled non-injection.                                | ✓ SATISFIED | `test/vite-hmr.test.ts:59-95`.                                                                                                     |
| TEST-02     | 02-01        | Unit tests cover virtual bridge resolution and loading.                                           | ✓ SATISFIED | `test/vite-hmr.test.ts:35-57`, `97-107`.                                                                                           |
| TEST-03     | 02-03        | Unit tests cover SSR/server hot updates forwarding to client channel.                             | ✓ SATISFIED | `test/vite-hmr.test.ts:110-198`.                                                                                                   |
| TEST-04     | 02-03        | Unit tests cover `hmr:false` fallback/full reload behavior.                                       | ✓ SATISFIED | `test/vite-hmr.test.ts:200-290`.                                                                                                   |

No additional Phase 2 requirement IDs were found in `.planning/REQUIREMENTS.md` beyond the IDs claimed by the three plans.

### Anti-Patterns Found

| File                       | Line | Pattern                                              | Severity | Impact                                                                             |
| -------------------------- | ---: | ---------------------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `src/vite.ts`              |   15 | Existing TODO for Qwik library noExternal workaround | ℹ️ Info  | Pre-existing unrelated TODO; does not affect Phase 2 HMR behavior.                 |
| `src/rolldown.ts`          |   64 | Existing TODO for Qwik library noExternal workaround | ℹ️ Info  | Pre-existing unrelated TODO; does not affect Phase 2 HMR behavior.                 |
| `src/build/static-html.ts` |    5 | Existing TODO for upstream bootstrap tag generation  | ℹ️ Info  | Static HTML concern deferred outside Phase 2; Phase 3 covers build/static leakage. |

No blocker anti-patterns found. `return null`/`return []` matches in HMR code are hook non-handled/handled return values, not stubs.

### Human Verification Required

None for Phase 2's code-level transport contract. Real browser/fixture smoke coverage is explicitly scheduled in Phase 4 (`TEST-07`) and is not a Phase 2 gap.

### Gaps Summary

No blocking gaps found. The implementation has substantive artifacts, Vite adapter wiring, bridge/runtime data flow, focused tests, and boundary checks matching the Phase 2 roadmap contract.

---

_Verified: 2026-05-10T03:32:40Z_
_Verifier: OpenCode (gsd-verifier)_
