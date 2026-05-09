# Codebase Concerns

**Analysis Date:** 2026-05-09

## Tech Debt

**Qwik library externalization workaround:**

- Issue: Server-side external handling wraps user `external` configuration so `.qwik.` library output is forced back into the bundle. The workaround is explicitly documented in both adapters and depends on the outcome of Qwik evolution discussion 318.
- Files: `src/rolldown.ts:63`, `src/vite.ts:14`, `src/qwik-external.ts:26`, `src/qwik-external.ts:113`, `test/qwik-external.test.ts:11`, `test/qwik-external.test.ts:52`
- Impact: Server bundling correctness depends on bespoke matching rules in `src/qwik-external.ts`; changes in Rolldown/Vite external semantics or Qwik library package shape can break SSR library consumption.
- Fix approach: Keep this path covered with fixture-backed SSR library tests, then remove `qwikExternal()` and `qwikViteExternal()` once upstream package metadata or resolver behavior makes Qwik library output bundle-safe without plugin intervention.

**Static CSR preloader implementation is local to the bundler:**

- Issue: Static CSR HTML injection manually generates Qwik preloader, bundle-graph fetch, core preload, and reachable modulepreload tags instead of using shared Qwik core rendering helpers.
- Files: `src/build/static-html.ts:1`, `src/build/static-html.ts:5`, `src/build/static-html.ts:35`, `src/build/static-html.ts:54`, `AGENTS.md:28`, `test/static-html.test.ts:6`
- Impact: CSR static HTML can drift from SSR/SSG preloader behavior, producing duplicate, missing, or incompatible bootstrap markup when Qwik core changes its runtime preload contract.
- Fix approach: Keep preloader generation isolated in `src/build/static-html.ts`; compare changes against `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins`; replace the local tag builder with shared upstream/core generation when available.

**Manifest and bundle-graph creation is concentrated in one large module:**

- Issue: Manifest symbol mapping, asset detection, runtime bundle detection, import filtering, graph conversion, sorting, and hashing all live in one 399-line file.
- Files: `src/build/manifest.ts:68`, `src/build/manifest.ts:178`, `src/build/manifest.ts:286`, `src/build/manifest.ts:310`, `src/build/manifest.ts:341`, `src/build/manifest.ts:392`, `test/manifest.test.ts:39`
- Impact: Small schema or runtime detection changes can affect unrelated manifest fields; missed fixture coverage can silently alter `q-manifest.json` or `build/bundle-graph.json` output.
- Fix approach: Preserve the public `createManifest()` contract; add focused tests before changing symbol mapping, runtime detection, or graph conversion; extract helpers only when tests demonstrate a stable seam.

**Cross-build manifest sharing uses module-level state:**

- Issue: Client manifests are cached in a module-level `Map<string, QwikManifest>` keyed by root and reused by later builds without an explicit lifecycle API.
- Files: `src/rolldown.ts:53`, `src/rolldown.ts:121`, `src/rolldown.ts:126`, `src/rolldown.ts:273`, `src/rolldown.ts:275`, `test/manifest.test.ts:223`
- Impact: Multiple builds in the same process rely on root separation and build order; stale manifests can be injected if root paths collide or if client/server builds are orchestrated unexpectedly.
- Fix approach: Prefer explicit `manifestInput` for server builds; if shared cache behavior changes, test client-before-server, server-only, repeated build, and same-root rebuild flows.

**README references outdated file names:**

- Issue: Project documentation points to files that are not present in the current tree.
- Files: `README.md:13`, `README.md:54`, `README.md:55`, `README.md:57`, actual files `src/build/manifest.ts`, `test/rolldown-transform.test.ts`, `test/rolldown-runtime.test.ts`
- Impact: New contributors and future agents can look for `src/q-manifest.ts` or `src/rolldown.test.ts` and miss the current manifest and test locations.
- Fix approach: Update `README.md` to reference `src/build/manifest.ts`, `test/rolldown-transform.test.ts`, `test/rolldown-runtime.test.ts`, and the current role of `src/rolldown.ts`.

## Known Bugs

**No confirmed failing tests:**

- Symptoms: The full test suite passes: `pnpm test` reports 8 test files and 43 tests passing.
- Files: `package.json:14`, `vite.config.ts:14`, `test/*.test.ts`
- Trigger: Not applicable.
- Workaround: Not applicable.

**Server manifest can be unavailable when server builds run first:**

- Symptoms: Server transform warns and leaves `globalThis.__QWIK_MANIFEST__` in output when no client manifest is available and no `manifestInput` is provided.
- Files: `src/rolldown.ts:116`, `src/rolldown.ts:251`, `src/rolldown.ts:261`, `test/manifest.test.ts:223`
- Trigger: Run a production server build that references `globalThis.__QWIK_MANIFEST__` before running the client build or without passing `manifestInput`.
- Workaround: Run the client build before the server build for the same `rootDir`, or pass `manifestInput` to `qwikServer()`.

## Security Considerations

**Static HTML injection emits inline module script:**

- Risk: Strict Content Security Policy deployments that disallow inline scripts need a nonce/hash strategy; the injected preloader script currently has no nonce integration.
- Files: `src/build/static-html.ts:43`, `src/build/static-html.ts:44`, `src/build/static-html.ts:45`, `src/build/static-html.ts:46`, `test/static-html.test.ts:14`
- Current mitigation: The script content is generated from bundle manifest paths and JSON-stringified URLs in `src/build/static-html.ts:45` and `src/build/static-html.ts:46`.
- Recommendations: Add an option or manifest-provided injection path for CSP nonce/hash support before targeting locked-down production environments.

**HTML mutation uses regex-based parsing:**

- Risk: Complex HTML, unusual quoting, malformed tags, or nonstandard script attributes can avoid detection or receive injected tags in the wrong location.
- Files: `src/build/static-html.ts:11`, `src/build/static-html.ts:13`, `src/build/static-html.ts:15`, `src/build/static-html.ts:84`, `src/build/static-html.ts:114`, `test/static-html.test.ts:53`
- Current mitigation: Tests cover type/src attribute order and SSR marker skipping in `test/static-html.test.ts:25` and `test/static-html.test.ts:53`.
- Recommendations: Add fixture cases for missing `<head>`, multiple module entry scripts, absolute CDN URLs, HTML entities, and CSP-bearing pages before broadening static HTML support.

**No application secrets detected in source tree scan:**

- Risk: Secret-bearing files are not part of the committed code paths inspected for this audit.
- Files: `package.json`, `src/rolldown.ts`, `src/vite.ts`, `src/build/static-html.ts`, `src/build/manifest.ts`
- Current mitigation: Environment files were not read; no `.env` contents are required by the package code.
- Recommendations: Keep secrets out of fixtures and tests; document only environment variable names if future integrations introduce credentials.

## Performance Bottlenecks

**Manifest creation scans bundle contents repeatedly:**

- Problem: `createManifest()` iterates every bundle item, scans library chunk code with a global regex, maps imports through bundle lookups, sorts multiple records, serializes the manifest for hashing, and converts the bundle graph.
- Files: `src/build/manifest.ts:85`, `src/build/manifest.ts:106`, `src/build/manifest.ts:122`, `src/build/manifest.ts:126`, `src/build/manifest.ts:161`, `src/build/manifest.ts:164`, `src/build/manifest.ts:173`
- Cause: Manifest generation is single-pass for bundle items but still performs per-chunk code scans and full-object sorting/serialization at generate-bundle time.
- Improvement path: Measure large app bundle generation before optimizing; cache bundle filename mapping and constrain `findLibraryQrlSymbols()` to package outputs that need QRL string recovery.

**Static HTML entry detection is O(html scripts × bundles):**

- Problem: Each module script lookup calls `Object.keys(manifest.bundles).find(...)`, and reachable preload generation walks dependencies in JavaScript arrays.
- Files: `src/build/static-html.ts:84`, `src/build/static-html.ts:99`, `src/build/static-html.ts:101`, `src/build/static-html.ts:54`, `src/build/static-html.ts:66`
- Cause: There is no precomputed map from script URL suffixes to bundle names for HTML injection.
- Improvement path: Build a local `Set` or suffix map once per manifest when static HTML assets or bundle counts become large enough to show measurable overhead.

**Optimizer runs in every source transform path:**

- Problem: Every JS/TS/JSX/TSX source outside non-Qwik `node_modules` goes through `transformModules()` with TS and JSX transpilation enabled.
- Files: `src/rolldown.ts:228`, `src/rolldown.ts:232`, `src/rolldown.ts:296`, `src/rolldown.ts:302`, `src/rolldown.ts:303`, `src/rolldown.ts:304`, `test/rolldown-transform.test.ts:167`
- Cause: The plugin relies on the optimizer to decide output modules for all eligible source files.
- Improvement path: Keep the current correctness-first boundary; consider fast-path detection only with fixture-backed evidence that non-Qwik source transforms dominate build time.

## Fragile Areas

**Dev QRL segment resolution and parent transformation:**

- Files: `src/dev.ts:44`, `src/dev.ts:49`, `src/dev.ts:52`, `src/dev.ts:69`, `src/dev.ts:72`, `src/dev.ts:122`, `test/rolldown-runtime.test.ts:189`, `test/rolldown-runtime.test.ts:222`, `test/rolldown-runtime.test.ts:235`
- Why fragile: Dev segment IDs are parsed from generated QRL URL names with a regex and loaded from in-memory maps; on-demand parent transformation depends on narrow Vite server callbacks.
- Safe modification: Preserve `\0qwik:segment:<environment>:<path>` IDs and add tests for each new dev URL shape before changing `parseDevQrl()` or `transformDevParent()`.
- Test coverage: Unit tests cover root-relative QRLs, relative QRLs, and on-demand parent transformation; fixture-backed browser HMR behavior is not present in `test/*.test.ts`.

**Vite environment detection depends on hook context shape:**

- Files: `src/vite.ts:70`, `src/vite.ts:79`, `src/vite.ts:86`, `src/vite.ts:90`, `test/vite-plugin.test.ts:88`, `test/vite-plugin.test.ts:114`, `test/vite-config.test.ts:105`
- Why fragile: `getBuildEnvironment()` reads optional Vite environment internals (`consumer`, `build.lib`) and defaults to client when absent.
- Safe modification: Add tests for new Vite environment names and library/server combinations before changing context detection.
- Test coverage: Unit tests cover client, server, and library contexts; fixture runs are manual through `fixtures/README.md`.

**Runtime chunk detection uses path regexes tied to package layout:**

- Files: `src/build/chunking.ts:10`, `src/build/chunking.ts:12`, `src/build/chunking.ts:13`, `src/build/manifest.ts:62`, `src/build/manifest.ts:63`, `src/build/manifest.ts:64`
- Why fragile: Qwik core package path changes can make core, handlers, preloader, or qwikloader chunks undetectable.
- Safe modification: Compare with upstream Qwik Vite plugin paths and add manifest/chunking tests for any new runtime package layout.
- Test coverage: Tests cover current core, handlers, preloader, and loader naming patterns indirectly through `test/chunking.test.ts`, `test/manifest.test.ts`, and `test/static-html.test.ts`.

## Scaling Limits

**Test suite is unit-heavy with manual fixture smoke targets:**

- Current capacity: `pnpm test` executes 43 unit tests in 8 files; fixtures are documented as manual QA targets in `fixtures/README.md:7` and `README.md:35`.
- Limit: Cross-product behavior across CSR, SSR/Nitro, router, library, and server adapters can regress without automated fixture builds.
- Scaling path: Add scripted fixture build targets for `fixtures/vite-csr`, `fixtures/vite-nitro-v3`, `fixtures/vite-qwik-router`, `fixtures/rolldown-h3`, `fixtures/rolldown-hono`, `fixtures/rolldown-library`, and `fixtures/rolldown-library-consumer`.

**No coverage threshold is enforced:**

- Current capacity: Vitest includes `test/**/*.test.ts`, and `package.json` exposes `pnpm test`; no coverage command or threshold is configured.
- Limit: Untested branches in manifest generation, HTML injection, and Vite/Rolldown adapters can grow unnoticed.
- Scaling path: Add coverage reporting to `vite.config.ts` or package scripts after stabilizing fixture build automation.

## Dependencies at Risk

**Rolldown release candidate API:**

- Risk: `rolldown` is pinned as `^1.0.0-rc.18` in both dev and peer dependencies, while plugin code uses Rolldown-specific hook shapes and output options.
- Impact: RC API changes can affect `Plugin`, `OutputOptions`, `CodeSplittingOptions`, `emitFile`, `resolve`, and Vite's Rolldown integration.
- Migration plan: Keep adapter code in `src/rolldown.ts` and `src/build/chunking.ts`; update tests around `callOutputOptions()`, `callResolveId()`, and fixture builds when upgrading Rolldown.

**Qwik optimizer beta package:**

- Risk: `@qwik.dev/optimizer` is `2.1.0-beta.2`, and the adapter depends on `createOptimizer()`, `transformModules()`, `SegmentAnalysis`, and Qwik runtime output shape.
- Impact: Optimizer output changes can break segment IDs, symbol mapping, manifest creation, and dev QRL loading.
- Migration plan: Pin and upgrade deliberately; validate `src/rolldown.ts`, `src/dev.ts`, `src/build/manifest.ts`, `test/rolldown-transform.test.ts`, `test/rolldown-runtime.test.ts`, and fixture builds together.

**Vite major-version dependency:**

- Risk: `vite` is `^8.0.10`, and the Vite wrapper depends on environment context behavior and dynamic imports from `vite`/`vitefu`.
- Impact: Changes in Vite environment naming, `configEnvironment`, server `transformRequest`, or `searchForWorkspaceRoot()` can break `src/vite.ts`, `src/dev.ts`, and `src/qwik-external.ts`.
- Migration plan: Treat Vite upgrades as adapter work; run Vite config unit tests and all Vite fixtures before release.

## Missing Critical Features

**Automated fixture regression command:**

- Problem: Fixtures exist for CSR, SSR/Nitro, router, library, H3, Hono, and library-consumer scenarios, but package scripts expose only `build`, `test`, `test:watch`, `check`, and `prepare`.
- Blocks: Routine verification of real bundler output across supported host environments.

**CSP integration for injected HTML:**

- Problem: Static CSR injection emits inline module script without nonce/hash configuration.
- Blocks: Adoption in applications with strict `script-src` policies.

## Test Coverage Gaps

**Browser HMR behavior:**

- What's not tested: End-to-end Vite serve HMR behavior, browser bridge behavior, and live QRL updates.
- Files: `src/dev.ts`, `src/vite.ts`, `test/rolldown-runtime.test.ts`
- Risk: Dev-only regressions can pass unit tests while failing in a browser session.
- Priority: High

**Static HTML edge cases:**

- What's not tested: Missing `<head>`, multiple entry scripts, CDN bases, CSP nonce propagation, malformed HTML, SSR marker variants outside current regex, and non-string assets.
- Files: `src/build/static-html.ts`, `test/static-html.test.ts`
- Risk: Static CSR pages can receive incomplete or policy-incompatible preload markup.
- Priority: Medium

**Manifest behavior on large and mixed bundles:**

- What's not tested: Duplicate symbol exports across chunks, chunks with both Qwik and non-Qwik module IDs, asset names without `names[0]`, and manifest cache invalidation across repeated same-root builds.
- Files: `src/build/manifest.ts`, `src/rolldown.ts`, `test/manifest.test.ts`
- Risk: Production manifests can become incomplete or stale in complex applications.
- Priority: High

**Fixture builds in CI:**

- What's not tested: Automated builds for `fixtures/vite-csr`, `fixtures/vite-nitro-v3`, `fixtures/vite-qwik-router`, `fixtures/rolldown-h3`, `fixtures/rolldown-hono`, `fixtures/rolldown-library`, `fixtures/rolldown-library-consumer`, and `fixtures/tsdown-library`.
- Files: `fixtures/README.md`, `fixtures/*/package.json`, `package.json`, `vite.config.ts`
- Risk: Host integration regressions can pass mocked unit tests.
- Priority: High

---

_Concerns audit: 2026-05-09_
