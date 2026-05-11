---
phase: 03-serve-build-gating-and-regression-safety
verified: 2026-05-10T04:57:07Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 3: Serve/Build Gating and Regression Safety Verification Report

**Phase Goal:** Maintainers can ship the HMR port without dev-only code leaking into builds or changing existing bundler outputs.
**Verified:** 2026-05-10T04:57:07Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                    | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Production, SSR build, static HTML, raw Rolldown, and library outputs contain no Qwik HMR bridge or generated dev-only HMR code.                         | ✓ VERIFIED | `src/vite.ts:25-28,41-45` gates HMR enablement to Vite serve with `hmr !== false`; `src/vite/hmr.ts:63-66` returns no HTML bridge when disabled; `src/rolldown.ts:313-320` selects `hmr` optimizer mode only when dev is enabled and HMR is not disabled; `src/dev.ts:186-197` appends self-accept code only when HMR is enabled. `pnpm test:hmr-leakage` built CSR, Nitro, Vite library, and raw Rolldown library fixtures, then reported no forbidden strings. |
| 2   | Static CSR preloader injection remains isolated and unchanged by HMR work.                                                                               | ✓ VERIFIED | `src/build/static-html.ts` imports no HMR modules and only injects preloader/bootstrap/modulepreload tags from manifest data (`lines 17-31,35-52,54-75`). `test/static-html.test.ts:6-24` asserts expected preloader output and absence of HMR strings.                                                                                                                                                                                                          |
| 3   | SSR/SSG duplicate-preloader avoidance via `q:render="ssr"` and `q:render="ssr-dev"` remains unchanged.                                                   | ✓ VERIFIED | `src/build/static-html.ts:13,22` skips HTML matching `q:render="ssr"` or `q:render="ssr-dev"`; `test/static-html.test.ts:26-42` verifies both markers are byte-for-byte unchanged.                                                                                                                                                                                                                                                                               |
| 4   | Fixture coverage verifies SSR/Nitro and library builds continue passing without HMR leakage.                                                             | ✓ VERIFIED | `package.json:17` defines `test:hmr-leakage` to build package, CSR, Nitro, Vite library, and raw Rolldown library fixtures before scanning; command run passed and scanner printed `No forbidden Qwik HMR strings found in generated fixture artifacts.`                                                                                                                                                                                                         |
| 5   | Build, SSR, raw Rolldown, and library optimizer paths never select HMR mode; generated segment accept code stays restricted to enabled dev HMR contexts. | ✓ VERIFIED | `test/vite-plugin.test.ts:88-166` covers server/client build/library optimizer modes and asserts no `mode: 'hmr'`; `test/rolldown-runtime.test.ts:189-268,602-636` covers production/server/library no-HMR leakage and `hmr: false` no self-accept. Focused unit command passed 48 tests.                                                                                                                                                                        |
| 6   | The leakage check searches explicit generated output directories so ignored build artifacts are scanned.                                                 | ✓ VERIFIED | `scripts/check-hmr-leakage.mjs:5-10` statically lists `fixtures/vite-csr/dist`, `fixtures/vite-nitro-v3/.output`, `fixtures/vite-library/dist`, and `fixtures/rolldown-library/lib`; `lines 46-58` fail missing output roots; `lines 61-100` recursively scan text-like generated files.                                                                                                                                                                         |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact                        | Expected                                  | Status     | Details                                                                                                                                            |
| ------------------------------- | ----------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/vite.ts`                   | Serve/build HMR enable gate               | ✓ VERIFIED | HMR enabled callback is `serve && options.hmr !== false`; `serve` is set only from Vite `command === 'serve'`.                                     |
| `src/vite/hmr.ts`               | Bridge injection and transport helper     | ✓ VERIFIED | `transformIndexHtml()` returns `undefined` when disabled; bridge module exists only through explicit virtual resolution/loading.                   |
| `src/rolldown.ts`               | Optimizer mode gate and output hooks      | ✓ VERIFIED | `mode: 'hmr'` requires dev enabled; lib gets `mode: 'lib'`, non-dev gets `mode: 'prod'`; static HTML injection remains in client `generateBundle`. |
| `src/dev.ts`                    | Dev segment accept-code gate              | ✓ VERIFIED | `appendSegmentAccept()` returns original code unless HMR is enabled and segment is not `worker$`.                                                  |
| `src/build/static-html.ts`      | Isolated static preloader helper          | ✓ VERIFIED | Handles only HTML assets and skips SSR/SSG render markers; no HMR imports or bridge strings.                                                       |
| `test/vite-hmr.test.ts`         | Build bridge non-injection coverage       | ✓ VERIFIED | Includes GATE-04 build-mode transformIndexHtml negative assertions.                                                                                |
| `test/vite-plugin.test.ts`      | Build/SSR/library optimizer mode coverage | ✓ VERIFIED | Asserts production/server/library modes and never-HMR calls.                                                                                       |
| `test/rolldown-runtime.test.ts` | Raw Rolldown/library no-leakage coverage  | ✓ VERIFIED | Asserts production/server/library outputs and disabled HMR segments contain no dev-only strings.                                                   |
| `test/static-html.test.ts`      | Static CSR and SSR marker coverage        | ✓ VERIFIED | Asserts preloader tags, no HMR strings, and both `ssr`/`ssr-dev` skip markers.                                                                     |
| `scripts/check-hmr-leakage.mjs` | Fixture artifact scanner                  | ✓ VERIFIED | Static roots, static denylist, missing-root failures, recursive scan.                                                                              |
| `package.json`                  | Package-level fixture leakage command     | ✓ VERIFIED | `test:hmr-leakage` builds package and all required fixtures, then runs scanner.                                                                    |

### Key Link Verification

| From                            | To                              | Via                                                                | Status  | Details                                                                                     |
| ------------------------------- | ------------------------------- | ------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------- |
| `src/vite.ts`                   | `src/vite/hmr.ts`               | `createViteHmr({ enabled: () => serve && options.hmr !== false })` | ✓ WIRED | HMR helper receives the Vite serve/build gate directly.                                     |
| `src/rolldown.ts`               | `@qwik.dev/optimizer`           | `transformModules({ mode: ... })`                                  | ✓ WIRED | `hmr` mode is selected only for enabled dev HMR; build/server/lib paths use `prod`/`lib`.   |
| `src/rolldown.ts`               | `src/build/static-html.ts`      | `injectQwikPreloaderTags(bundle, clientManifest)`                  | ✓ WIRED | Static HTML mutation remains a client output hook after manifest creation.                  |
| `package.json`                  | `scripts/check-hmr-leakage.mjs` | `test:hmr-leakage` script                                          | ✓ WIRED | Script builds fixtures and invokes `node scripts/check-hmr-leakage.mjs`.                    |
| `scripts/check-hmr-leakage.mjs` | Fixture output dirs             | Static `scanRoots`                                                 | ✓ WIRED | Explicitly scans CSR, Nitro `.output`, Vite library, and raw Rolldown library output roots. |

### Data-Flow Trace (Level 4)

| Artifact                        | Data Variable                                  | Source                                                                        | Produces Real Data | Status    |
| ------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- | ------------------ | --------- |
| `scripts/check-hmr-leakage.mjs` | `scanRoots`, `forbiddenStrings`, file contents | Static constants + generated fixture files read with `readFile(file, 'utf8')` | Yes                | ✓ FLOWING |
| `src/build/static-html.ts`      | `manifest`, HTML asset source                  | Client `generateBundle` passes actual `createManifest(bundle, ...)` result    | Yes                | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior                                                | Command                                                                                                           | Result                                                                                                                 | Status |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| Focused Phase 3 unit gates pass                         | `pnpm test test/vite-hmr.test.ts test/vite-plugin.test.ts test/rolldown-runtime.test.ts test/static-html.test.ts` | 4 test files passed, 48 tests passed                                                                                   | ✓ PASS |
| Fixture builds and generated artifact leakage scan pass | `pnpm test:hmr-leakage`                                                                                           | Package, CSR, Nitro, Vite library, and raw Rolldown library builds passed; scanner found no forbidden Qwik HMR strings | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan  | Description                                                                                                                      | Status      | Evidence                                                                                                                                 |
| ----------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GATE-04     | 03-01, 03-03 | Production, SSR build, static HTML, raw Rolldown, and library outputs contain no Qwik HMR bridge or generated dev-only HMR code. | ✓ SATISFIED | Source gates verified; focused tests pass; `pnpm test:hmr-leakage` scanned generated outputs with no forbidden strings.                  |
| GATE-05     | 03-02, 03-03 | Static CSR preloader injection and SSR/SSG duplicate-preloader avoidance remain unchanged by HMR implementation.                 | ✓ SATISFIED | Static helper remains isolated; tests cover preloader output, no HMR strings, and both SSR markers; CSR output included in fixture scan. |
| TEST-08     | 03-01, 03-03 | Fixture coverage verifies SSR/Nitro and library builds continue to pass without HMR leakage.                                     | ✓ SATISFIED | `test:hmr-leakage` builds Nitro, Vite library, and raw Rolldown library fixtures before scanning generated artifact roots.               |

### Anti-Patterns Found

| File                       | Line | Pattern                                             | Severity | Impact                                                                                |
| -------------------------- | ---- | --------------------------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `src/build/static-html.ts` | 5    | TODO about moving bootstrap tag generation upstream | ℹ️ Info  | Existing documented upstream direction, not a stub and does not affect Phase 3 gates. |

### Human Verification Required

None. The phase goal is build/test/scanner-verifiable and both focused unit gates plus fixture leakage command passed locally.

### Gaps Summary

No blocking gaps found. The implementation and tests substantively verify that HMR stays gated to Vite serve/dev contexts, static preloader behavior remains isolated, and representative CSR, Nitro, Vite library, and raw Rolldown library generated artifacts contain no forbidden HMR strings.

---

_Verified: 2026-05-10T04:57:07Z_
_Verifier: OpenCode (gsd-verifier)_
