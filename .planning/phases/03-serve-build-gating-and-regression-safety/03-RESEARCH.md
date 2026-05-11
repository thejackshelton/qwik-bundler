# Phase 3: Serve/Build Gating and Regression Safety - Research

**Researched:** 2026-05-10  
**Domain:** Vite/Rolldown build gating, Qwik HMR leakage prevention, fixture regression safety  
**Confidence:** HIGH

## User Constraints

No `03-CONTEXT.md` exists for this phase, so there are no phase-specific locked user decisions to copy verbatim. [VERIFIED: `gsd-sdk query init.phase-op "03"` returned `has_context: false`]

## Project Constraints (from AGENTS.md)

- Compare Vite, Rolldown, dev-server, HMR, manifest, optimizer, and static HTML behavior against `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins` when needed. [VERIFIED: `AGENTS.md:3-9`]
- Keep this rewrite simpler and easier to read than upstream unless a fixture or test proves extra complexity is needed. [VERIFIED: `AGENTS.md:8-9`, `AGENTS.md:49-56`]
- Keep `src/rolldown.ts` focused on bundler integration, optimizer transforms, manifest creation, and output hooks. [VERIFIED: `AGENTS.md:17`]
- Keep `src/vite.ts` focused on Vite adapter wiring only. [VERIFIED: `AGENTS.md:18`]
- Keep production build helpers under `src/build/*`, and keep static HTML mutation in `src/build/static-html.ts` using only data it is given. [VERIFIED: `AGENTS.md:19-20`, `AGENTS.md:25-29`]
- Keep HMR split between dev segment handling, Vite HMR wiring, and browser bridge code. [VERIFIED: `AGENTS.md:21`, `AGENTS.md:35-39`]
- Raw Rolldown should remain build/library/server tooling; full browser HMR belongs to Vite serve. [VERIFIED: `AGENTS.md:31-34`]
- `hmr: false` must opt out cleanly. [VERIFIED: `AGENTS.md:33-34`]
- Prefer fixture-backed coverage across CSR, SSR/Nitro, and library modes for shared bundler behavior. [VERIFIED: `AGENTS.md:58-63`]
- Use `ufo` for URL handling and `pathe` for filesystem-style paths instead of hand-rolled string logic. [VERIFIED: `AGENTS.md:52-53`]
- Do not add Qwik Router defaults, preview middleware, or app-specific path/output wiring to the core bundler plugin. [VERIFIED: `AGENTS.md:13-16`, `AGENTS.md:27-29`]

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                                                                                 | Research Support                                                                                                                                                                                                                                                                                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GATE-04 | Production, SSR build, static HTML, raw Rolldown, and library outputs contain no Qwik HMR bridge or generated dev-only HMR code. [VERIFIED: `.planning/REQUIREMENTS.md:15`] | Gate on Vite serve plus `hmr !== false`, assert production transform modes are not `hmr`, build key fixtures, and search built outputs for `virtual:qwik-hmr-bridge`, `qwik:hmr`, `qHmr`, `import.meta.hot`, `document.__hmrT`, and `location.reload`. [VERIFIED: `src/vite.ts:25-30`, `src/rolldown.ts:313-320`, `rg` output search after fixture builds returned no matches] |
| GATE-05 | Static CSR preloader injection and SSR/SSG duplicate-preloader avoidance remain unchanged by HMR. [VERIFIED: `.planning/REQUIREMENTS.md:16`]                                | Keep HMR out of `src/build/static-html.ts`; extend/retain tests around bootstrap tags, reachable modulepreloads, script-base URL derivation, and `q:render="ssr"` / `q:render="ssr-dev"` skip behavior. [VERIFIED: `src/build/static-html.ts:17-32`, `src/build/static-html.ts:84-120`, `test/static-html.test.ts:5-64`]                                                       |
| TEST-08 | Fixture coverage verifies SSR/Nitro and library builds continue to pass without HMR leakage. [VERIFIED: `.planning/REQUIREMENTS.md:52`]                                     | Use package build followed by fixture builds for `@fixtures/vite-nitro-v3`, `@fixtures/vite-library`, `@fixtures/rolldown-library`, and optionally `@fixtures/vite-csr`; then grep generated output for HMR leakage strings. [VERIFIED: `fixtures/README.md:7-17`, fixture package scripts, successful research run of `pnpm build && pnpm --filter ... build`]                |

</phase_requirements>

## Summary

Phase 3 should plan regression gates, not new HMR features. Phase 2 already added Vite serve bridge injection, custom-event transport, SSR forwarding, and `hmr: false` reload fallback; verification confirmed those seams and identified Phase 3 as the build/static leakage gate. [VERIFIED: `.planning/phases/02-vite-hmr-transport-and-browser-bridge/02-VERIFICATION.md:20-28`, `.planning/phases/02-vite-hmr-transport-and-browser-bridge/02-VERIFICATION.md:92-108`]

The primary risk is that dev-only HMR strings or optimizer `mode: 'hmr'` output reach production, SSR/Nitro, raw Rolldown, or library artifacts. The current code already gates HMR enablement from the Vite adapter with `serve && options.hmr !== false`, and the optimizer mode switches to `hmr` only when `dev.isEnabled()` and HMR is not disabled. [VERIFIED: `src/vite.ts:25-30`, `src/vite.ts:41-45`, `src/rolldown.ts:313-320`] The planner should convert those seams into explicit unit tests and fixture artifact gates. [VERIFIED: successful focused test run `pnpm test test/static-html.test.ts test/vite-hmr.test.ts test/vite-plugin.test.ts` passed 23 tests]

Static CSR preloader behavior is a separate production HTML concern and should not be reworked for HMR. The static HTML helper injects Qwik preloader/bootstrap/modulepreload tags only into generated HTML assets and skips SSR/SSG markup when `q:render="ssr"` or `q:render="ssr-dev"` is present. [VERIFIED: `src/build/static-html.ts:17-32`, `src/build/static-html.ts:13`, `test/static-html.test.ts:5-64`]

**Primary recommendation:** Plan Phase 3 as one regression-gate wave: add focused unit tests for build/serve gating and static HTML invariants, then add fixture build commands plus artifact grep assertions for SSR/Nitro, Vite library, raw Rolldown library, and CSR outputs. [VERIFIED: `.planning/ROADMAP.md:73-84`, `fixtures/README.md:7-17`]

## Architectural Responsibility Map

| Capability                                  | Primary Tier                      | Secondary Tier                   | Rationale                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | --------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serve-only HMR bridge injection             | Frontend Server / Vite dev server | Browser / Client                 | `transformIndexHtml` injection is owned by the Vite adapter during serve; the browser only executes the injected virtual module. [VERIFIED: `src/vite.ts:51-52`, `src/vite/hmr.ts:63-83`, Vite `transformIndexHtml` docs]                                                                       |
| HMR leakage prevention in production builds | API / Backend build plugin layer  | CDN / Static output              | The plugin selects optimizer mode and emits artifacts during bundler hooks; generated static assets are the verification target. [VERIFIED: `src/rolldown.ts:228-291`, `src/rolldown.ts:313-320`]                                                                                               |
| Static CSR preloader preservation           | CDN / Static output               | API / Backend build plugin layer | `src/build/static-html.ts` mutates HTML assets after manifest creation and should stay independent of Vite HMR transport. [VERIFIED: `src/rolldown.ts:267-289`, `src/build/static-html.ts:17-32`]                                                                                               |
| SSR/Nitro regression safety                 | Frontend Server (SSR)             | API / Backend build plugin layer | Nitro builds both client and SSR/server artifacts through Vite; Qwik bundler must preserve manifest handoff and avoid HMR strings in `.output`. [VERIFIED: `fixtures/vite-nitro-v3/vite.config.ts:5-15`, successful `@fixtures/vite-nitro-v3 build`]                                            |
| Library regression safety                   | API / Backend build plugin layer  | Package output                   | Vite and Rolldown library fixtures build package artifacts with `build.lib` or `qwikLib()`, and library mode must use optimizer `mode: 'lib'`, not HMR. [VERIFIED: `fixtures/vite-library/vite.config.ts:4-14`, `fixtures/rolldown-library/rolldown.config.ts:4-17`, `src/rolldown.ts:313-320`] |

## Standard Stack

### Core

| Library               | Project Version                           | Registry Verification                                                                                         | Purpose                                                                                    | Why Standard                                                                                                                                                                                    |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite                  | `^8.0.10` installed as `8.0.10`           | current `8.0.11`, modified `2026-05-07T09:39:41.467Z` [VERIFIED: npm registry, `pnpm exec vite --version`]    | Vite serve/build lifecycle, `transformIndexHtml`, environment HMR channels, fixture builds | This repo's Vite adapter and fixtures use Vite, and Vite docs define plugin hooks for HTML transforms and environment HMR. [VERIFIED: `package.json:31`, `src/vite.ts:1-7`, Context7 Vite docs] |
| Rolldown              | `^1.0.0-rc.18` installed as `1.0.0-rc.18` | current `1.0.0`, modified `2026-05-07T09:10:33.577Z` [VERIFIED: npm registry, `pnpm exec rolldown --version`] | Direct raw build/library fixture bundler                                                   | Raw Rolldown remains build/library/server tooling per project rules. [VERIFIED: `package.json:29`, `AGENTS.md:31-34`]                                                                           |
| `@qwik.dev/optimizer` | `2.1.0-beta.2`                            | current `2.1.0-beta.2`, modified `2026-04-30T20:45:45.726Z` [VERIFIED: npm registry]                          | Qwik transforms and mode selection (`prod`, `dev`, `hmr`, `lib`)                           | The bundler delegates Qwik semantic transforms to the optimizer. [VERIFIED: `src/rolldown.ts:1-8`, `src/rolldown.ts:300-322`]                                                                   |
| Vitest                | `^4.0.18` installed as `4.1.5`            | current `4.1.5`, modified `2026-05-05T10:41:50.265Z` [VERIFIED: npm registry, `pnpm exec vitest --version`]   | Focused unit and regression tests                                                          | Existing tests use Vitest and helper hook invokers. [VERIFIED: `vite.config.ts:14-17`, `test/helpers.ts:1-156`]                                                                                 |
| vite-plus             | `^0.1.20` installed/current `0.1.20`      | current `0.1.20`, modified `2026-05-08T07:34:56.193Z` [VERIFIED: npm registry]                                | Repo `build`, `test`, and `check` wrapper                                                  | Package scripts use `vp pack`, `vp test`, and `vp check`. [VERIFIED: `package.json:14-19`, `vite.config.ts:1-29`]                                                                               |

### Supporting

| Library | Version  | Purpose                             | When to Use                                                                                                                                                                              |
| ------- | -------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ufo`   | `^1.6.4` | URL joining/parsing                 | Use for bridge script base joining and source URL cleanup; do not add manual URL parsing for new gates. [VERIFIED: `package.json:24`, `src/vite/hmr.ts:1`, `src/build/static-html.ts:7`] |
| `pathe` | `^2.0.3` | Filesystem-style path normalization | Use for path-style fixture or artifact helpers when source paths must be normalized. [VERIFIED: `package.json:23`, `src/dev.ts:2`]                                                       |

### Alternatives Considered

| Instead of                                     | Could Use                         | Tradeoff                                                                                                                                               |
| ---------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Artifact grep checks after real fixture builds | Snapshot all fixture output files | Grep focuses on the leakage contract and avoids brittle hash/output churn. [VERIFIED: build outputs include hashed files in fixture build logs]        |
| Focused hook tests with Vitest helpers         | Browser smoke tests in Phase 3    | Browser smoke is assigned to Phase 4; Phase 3 is about build/static/library regression safety. [VERIFIED: `.planning/ROADMAP.md:86-95`]                |
| Existing fixture package scripts               | Custom one-off build harness      | Fixture scripts already encode host-owned app/library configurations and keep core bundler free of app defaults. [VERIFIED: `fixtures/README.md:3-17`] |

**Installation:**

```bash
pnpm install
```

No new packages are recommended for Phase 3. [VERIFIED: existing repo stack and successful focused tests/fixture builds]

## Architecture Patterns

### System Architecture Diagram

```text
Vite serve request
  -> src/vite.ts configResolved(command === 'serve')
  -> createViteHmr.enabled() = serve && hmr !== false
  -> transformIndexHtml injects virtual bridge only when enabled
  -> browser bridge listens for qwik:hmr

Vite/Rolldown production or library build
  -> src/vite.ts configResolved(command === 'build') OR direct qwikClient/qwikServer/qwikLib
  -> options.dev is false/absent
  -> src/rolldown.ts optimizer mode = prod/server or lib, not hmr
  -> client generateBundle creates manifest + static preloader tags
  -> fixture artifact grep verifies no HMR leakage strings

Static HTML asset
  -> src/rolldown.ts client generateBundle
  -> createManifest(...)
  -> injectQwikPreloaderTags(...)
  -> if q:render="ssr" or "ssr-dev": skip
  -> otherwise inject preloader/bootstrap/reachable modulepreloads
```

The diagram reflects local hook flow and fixture verification targets. [VERIFIED: `src/vite.ts:41-52`, `src/vite/hmr.ts:63-83`, `src/rolldown.ts:267-289`, `src/build/static-html.ts:17-32`]

### Recommended Project Structure

```text
src/
├── vite.ts              # Vite adapter composition and serve/build gating
├── vite/hmr.ts          # Vite-only HMR bridge, transport, and full-reload fallback
├── client/hmr-bridge.ts # Browser bridge runtime source
├── dev.ts              # Generic dev segment resolution/loading/self-accept code
└── build/static-html.ts # Production static CSR preloader injection only

test/
├── vite-hmr.test.ts        # Serve/HMR hook tests and disabled fallback
├── vite-plugin.test.ts     # Vite build environment/optimizer mode tests
├── rolldown-runtime.test.ts # Dev segment/self-accept gates
└── static-html.test.ts     # Static preloader invariants

fixtures/
├── vite-csr/
├── vite-nitro-v3/
├── vite-library/
└── rolldown-library/
```

This structure exists today and should be extended rather than reorganized. [VERIFIED: local file tree and `test/*.test.ts` glob]

### Pattern 1: Serve-only HTML injection gate

**What:** Keep Vite `transformIndexHtml` returning bridge tags only when Vite command is `serve` and `hmr` is not false. [VERIFIED: `src/vite.ts:25-30`, `src/vite.ts:41-52`, `src/vite/hmr.ts:63-73`]  
**When to use:** Any plan touching bridge injection, Vite config resolution, or HTML transforms. [VERIFIED: Phase requirements GATE-04/GATE-05]

**Example:**

```typescript
// Source: local pattern in src/vite.ts and src/vite/hmr.ts
const hmr = createViteHmr({
	base: () => base,
	enabled: () => serve && options.hmr !== false,
});
```

### Pattern 2: Optimizer mode regression test

**What:** Assert build/server/library contexts use `prod` or `lib`, never `hmr`. [VERIFIED: `src/rolldown.ts:313-320`, `test/vite-plugin.test.ts:88-137`]  
**When to use:** Any plan touching `options.dev`, `hmr`, `getBuildEnvironment`, or optimizer transform options. [VERIFIED: `src/vite.ts:41-45`, `src/vite.ts:122-138`]

**Example:**

```typescript
// Source: local pattern in test/vite-plugin.test.ts
expect(optimizerMock.transformModules).toHaveBeenCalledWith(
	expect.objectContaining({ mode: 'prod', entryStrategy: { type: 'hoist' } }),
);
```

### Pattern 3: Fixture artifact leakage gate

**What:** Build the package and representative fixtures, then search generated output for a small denylist of HMR-only strings. [VERIFIED: successful research build command and `rg` leakage search returned no matches]  
**When to use:** Phase completion and TEST-08 verification. [VERIFIED: `.planning/REQUIREMENTS.md:52`]

**Example:**

```bash
pnpm build
pnpm --filter @fixtures/vite-nitro-v3 build
pnpm --filter @fixtures/vite-library build
pnpm --filter @fixtures/rolldown-library build
rg -n "virtual:qwik-hmr-bridge|qwik:hmr|qHmr|import\.meta\.hot|document\.__hmrT|location\.reload" \
  fixtures/vite-nitro-v3/.output fixtures/vite-library/dist fixtures/rolldown-library/lib
```

### Anti-Patterns to Avoid

- **Moving HMR gates into static HTML helpers:** Static HTML preloader logic is production artifact mutation and should not know about the HMR bridge. [VERIFIED: `src/build/static-html.ts:17-32`, `AGENTS.md:23-29`]
- **Testing only hooks but not built artifacts:** GATE-04 is about output contents, so hook tests alone cannot prove no leakage. [VERIFIED: `.planning/REQUIREMENTS.md:15`, successful fixture build plus grep baseline]
- **Adding app/router defaults to make fixtures pass:** Fixtures own entries and adapters; the core bundler must not add router defaults or preview middleware. [VERIFIED: `AGENTS.md:13-16`, `fixtures/README.md:3-5`]
- **Using legacy Vite `server.ws.send` as the primary Phase 3 pattern:** Vite 8 environment docs show `this.environment.hot.send` for environment-aware custom HMR events. [CITED: https://github.com/vitejs/vite/blob/v8.0.10/docs/guide/api-environment-plugins.md]

## Don't Hand-Roll

| Problem                                          | Don't Build                                             | Use Instead                                            | Why                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL/base handling for bridge or HTML asset paths | String concatenation                                    | `ufo` `joinURL` / `parsePath`                          | Existing code uses `ufo`, and project rules prefer it. [VERIFIED: `src/vite/hmr.ts:1`, `src/build/static-html.ts:7`, `AGENTS.md:52-53`]            |
| Path normalization for dev/source keys           | Custom slash/drive parsing beyond existing helper seams | Existing `src/dev.ts` helpers using `pathe` and `ufo`  | Avoid expanding Phase 3 into path compatibility work. [VERIFIED: `src/dev.ts:149-179`]                                                             |
| Fixture orchestration                            | New bespoke fixture runner                              | Existing pnpm workspace filters and fixture scripts    | Fixtures already define host-native commands. [VERIFIED: `fixtures/README.md:7-17`, fixture `package.json` scripts]                                |
| HMR leakage verification                         | Manual visual inspection                                | Deterministic string denylist over generated artifacts | The leakage contract has identifiable bridge/runtime strings. [VERIFIED: `src/vite/hmr.ts:6-9`, `src/client/hmr-bridge.ts:4-21`, `src/dev.ts:196`] |
| Static preloader generation                      | Rewritten bootstrap/preload algorithm                   | Existing `injectQwikPreloaderTags` tests               | GATE-05 requires unchanged behavior, not a new implementation. [VERIFIED: `.planning/REQUIREMENTS.md:16`, `test/static-html.test.ts:5-64`]         |

**Key insight:** Phase 3 should freeze boundaries by testing them; custom gate infrastructure or static HTML rewrites would add more risk than they remove. [VERIFIED: `.planning/ROADMAP.md:73-84`, `AGENTS.md:49-63`]

## Common Pitfalls

### Pitfall 1: Bridge module resolvability mistaken for build leakage

**What goes wrong:** A test imports/loads the virtual bridge module directly and treats that as proof of production leakage. [VERIFIED: `src/vite/hmr.ts:75-83`]  
**Why it happens:** The bridge `resolveId/load` helper is available on the plugin object, but production HTML should not inject or reference it. [VERIFIED: `src/vite.ts:54-72`, `src/vite/hmr.ts:63-73`]  
**How to avoid:** Assert both: build `transformIndexHtml` returns `undefined`, and built artifacts contain no bridge/runtime strings. [VERIFIED: Vite `transformIndexHtml` docs and fixture grep baseline]  
**Warning signs:** Tests only call `resolveId/load` and never inspect HTML or output files. [VERIFIED: `test/vite-hmr.test.ts:35-107` current coverage shape]

### Pitfall 2: `options.dev` accidentally set during build

**What goes wrong:** Optimizer mode becomes `hmr` or `dev`, creating generated dev-only segment behavior in build outputs. [VERIFIED: `src/rolldown.ts:313-320`]  
**Why it happens:** `src/vite.ts` sets `rolldownOptions.dev = serve` during `configResolved`; changing command detection can alter optimizer mode. [VERIFIED: `src/vite.ts:41-45`]  
**How to avoid:** Add tests for build command, SSR environment, and library environment optimizer modes. [VERIFIED: `test/vite-plugin.test.ts:88-137`]  
**Warning signs:** `transformModules` receives `mode: 'hmr'` in a build-context test. [VERIFIED: `src/rolldown.ts:313-320`]

### Pitfall 3: Static CSR preloader regression hidden by HMR tests

**What goes wrong:** HMR changes alter `src/build/static-html.ts` or its call site, changing production preloader tags or duplicating SSR preloader markup. [VERIFIED: `src/rolldown.ts:282`, `src/build/static-html.ts:17-32`]  
**Why it happens:** Static CSR HTML and dev HTML injection both touch HTML, but they happen in different layers. [VERIFIED: `src/vite/hmr.ts:63-73`, `src/build/static-html.ts:17-32`]  
**How to avoid:** Keep static HTML tests in Phase 3's quick gate and add explicit `q:render="ssr-dev"` coverage if missing. [VERIFIED: current regex supports `ssr-dev` at `src/build/static-html.ts:13`; current tests cover `ssr` at `test/static-html.test.ts:25-35`]  
**Warning signs:** HMR files import from `src/build/static-html.ts`, or static HTML helper imports HMR bridge constants. [VERIFIED: `src/vite/hmr.ts`, `src/build/static-html.ts` imports]

### Pitfall 4: Fixture build passes but leakage grep misses ignored output

**What goes wrong:** Generated output is gitignored, and code search tools that skip ignored files report no files. [VERIFIED: Grep tool returned “No files found” for built output directories; `rg` over explicit output paths was needed]  
**Why it happens:** Generated fixture output directories are commonly ignored. [VERIFIED: observed tool behavior in this session]  
**How to avoid:** Use explicit `rg` paths in a command after fixture builds; do not rely on repo-wide content search defaults. [VERIFIED: `rg -n ... fixtures/...` returned no matches after builds]  
**Warning signs:** Search output says “No files found” instead of “no matches.” [VERIFIED: tool output]

## Code Examples

### Build command should not enable HMR bridge injection

```typescript
// Source: local helper pattern in test/vite-hmr.test.ts + src/vite.ts gating
const plugin = getPlugin(qwik(), 'vite-plugin-qwik');
callConfigResolved(plugin, { command: 'build', root: '/workspace/app' });
expect(await callTransformIndexHtml(plugin, '<html></html>')).toBeUndefined();
```

### SSR/SSG static HTML should skip preloader reinjection

```typescript
// Source: local pattern in test/static-html.test.ts
const source = bundle['index.html'].source.replace('<html>', '<html q:render="ssr-dev">');
bundle['index.html'].source = source;
await callGenerateBundle(plugin, bundle);
expect(bundle['index.html'].source).toBe(source);
```

### Leakage denylist after fixture builds

```bash
# Source: verified research command, no matches after successful builds
rg -n "virtual:qwik-hmr-bridge|qwik:hmr|qHmr|import\.meta\.hot|document\.__hmrT|location\.reload" \
  "fixtures/vite-csr/dist" \
  "fixtures/vite-nitro-v3/.output" \
  "fixtures/vite-library/dist" \
  "fixtures/rolldown-library/lib"
```

## State of the Art

| Old Approach                                        | Current Approach                                                         | When Changed                                                                                                                             | Impact                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Vite plugin `handleHotUpdate` with `server.ws.send` | Vite 8 environment-aware `hotUpdate` with `this.environment.hot.send`    | Vite docs include migration guidance for `hotUpdate` [CITED: https://github.com/vitejs/vite/blob/v8.0.10/docs/changes/hotupdate-hook.md] | Phase 3 should preserve current Vite helper boundaries and not introduce legacy transport. [VERIFIED: `src/vite/hmr.ts:85-126`] |
| Manual or app-owned production HMR checks           | Fixture-backed output gates                                              | Project roadmap assigns TEST-08 to Phase 3 [VERIFIED: `.planning/REQUIREMENTS.md:52`, `.planning/ROADMAP.md:73-84`]                      | Planner should include fixture build and artifact grep tasks. [VERIFIED: successful research build/grep baseline]               |
| HMR/static HTML coupled as one HTML concern         | Separate Vite dev HTML bridge and production static CSR preloader helper | Current repo separates `src/vite/hmr.ts` and `src/build/static-html.ts` [VERIFIED: local source]                                         | GATE-05 should protect static HTML invariants rather than modify them. [VERIFIED: `.planning/REQUIREMENTS.md:16`]               |

**Deprecated/outdated:**

- `handleHotUpdate`/`server.ws.send` as the primary pattern for this repo's Vite 8 custom event path is outdated for environment-aware plugins. [CITED: https://github.com/vitejs/vite/blob/v8.0.10/docs/changes/hotupdate-hook.md]

## Assumptions Log

| #   | Claim                                                                                                                     | Section         | Risk if Wrong                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Keep commands static and repo-local; avoid interpolating untrusted input. [ASSUMED]                                       | Security Domain | If Phase 3 later accepts dynamic paths/patterns, tests may need explicit escaping/argument-array execution rather than static shell commands. |
| A2  | Valid until: 2026-05-17 for Vite/Rolldown fast-moving APIs; 2026-06-09 for local project test/fixture patterns. [ASSUMED] | Metadata        | If Vite/Rolldown releases change hook semantics sooner, planner should re-check docs before implementation.                                   |

Assumptions are low-risk planning hygiene notes, not unresolved implementation questions. [VERIFIED: Open Questions section resolves Phase 3 implementation choices]

## Open Questions

None. The open Phase 3 questions are resolved as follows: use existing Vitest hook tests for focused gates, existing pnpm fixture scripts for TEST-08, explicit `rg` over generated output paths for leakage detection, and no changes to static HTML production logic unless an added regression test fails. [VERIFIED: successful focused tests, successful fixture builds, successful leakage grep baseline]

## Environment Availability

| Dependency               | Required By                             | Available                   | Version                    | Fallback                                                                                       |
| ------------------------ | --------------------------------------- | --------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| Node.js                  | Package scripts, Vite, Rolldown, Vitest | ✓                           | `v24.15.0`                 | None needed; package requires `>=22`. [VERIFIED: `node --version`, `package.json:47-48`]       |
| pnpm                     | Workspace scripts and fixture filters   | ✓                           | `10.33.2`                  | None needed; package declares `pnpm@10.33.2`. [VERIFIED: `pnpm --version`, `package.json:50`]  |
| Vite CLI                 | Vite CSR/Nitro/library fixture builds   | ✓ via `pnpm exec`           | `8.0.10`                   | None needed. [VERIFIED: `pnpm exec vite --version`]                                            |
| Vitest CLI               | Focused unit/regression tests           | ✓ via `pnpm exec`           | `4.1.5`                    | None needed. [VERIFIED: `pnpm exec vitest --version`]                                          |
| Rolldown CLI             | Raw Rolldown library fixture build      | ✓ via `pnpm exec`           | `1.0.0-rc.18`              | None needed. [VERIFIED: `pnpm exec rolldown --version`]                                        |
| Nitro fixture dependency | SSR/Nitro build gate                    | ✓ through workspace install | `3.0.260429-beta` declared | None needed. [VERIFIED: `fixtures/vite-nitro-v3/package.json:14-20`, successful fixture build] |

**Missing dependencies with no fallback:** None. [VERIFIED: environment probes and fixture builds succeeded]

**Missing dependencies with fallback:** None. [VERIFIED: environment probes and fixture builds succeeded]

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies                                 | Standard Control                                                                                                                                                             |
| --------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | no                                      | Phase 3 does not implement authentication. [VERIFIED: `.planning/REQUIREMENTS.md:10-53`]                                                                                     |
| V3 Session Management | no                                      | Phase 3 does not implement sessions. [VERIFIED: `.planning/REQUIREMENTS.md:10-53`]                                                                                           |
| V4 Access Control     | no                                      | Phase 3 does not implement authorization. [VERIFIED: `.planning/REQUIREMENTS.md:10-53`]                                                                                      |
| V5 Input Validation   | yes, for build/test artifact paths only | Use fixed fixture output paths and fixed leakage denylist; do not accept user-supplied shell fragments in tests. [VERIFIED: recommended commands use literal paths/patterns] |
| V6 Cryptography       | no                                      | Phase 3 does not implement cryptography. [VERIFIED: `.planning/REQUIREMENTS.md:10-53`]                                                                                       |

### Known Threat Patterns for Build/Test Gates

| Pattern                                                              | STRIDE                 | Standard Mitigation                                                                                             |
| -------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| False-negative leakage scan because ignored outputs are not searched | Tampering              | Search explicit generated output directories with `rg` after builds. [VERIFIED: observed Grep vs `rg` behavior] |
| Shell-injection-prone dynamic commands in tests                      | Elevation of Privilege | Keep commands static and repo-local; avoid interpolating untrusted input. [ASSUMED]                             |

## Sources

### Primary (HIGH confidence)

- `AGENTS.md` — project constraints, HMR direction, static HTML scope, verification expectations. [VERIFIED: local source]
- `.planning/REQUIREMENTS.md` — GATE-04, GATE-05, TEST-08 definitions. [VERIFIED: local source]
- `.planning/ROADMAP.md` — Phase 3 goal and success criteria. [VERIFIED: local source]
- `.planning/phases/02-vite-hmr-transport-and-browser-bridge/02-VERIFICATION.md` — Phase 2 completed HMR behavior and remaining Phase 3 gate. [VERIFIED: local source]
- `src/vite.ts`, `src/vite/hmr.ts`, `src/client/hmr-bridge.ts`, `src/dev.ts`, `src/rolldown.ts`, `src/build/static-html.ts` — current gating seams and production artifact behavior. [VERIFIED: local source]
- `test/static-html.test.ts`, `test/vite-hmr.test.ts`, `test/vite-plugin.test.ts`, `test/rolldown-runtime.test.ts`, `test/helpers.ts` — existing test patterns and gaps. [VERIFIED: local source]
- Fixture configs and package scripts under `fixtures/` — TEST-08 command targets. [VERIFIED: local source]
- Local upstream Qwik Vite plugin under `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins` — upstream HMR bridge, transformIndexHtml serve gate, SSR forwarding, optimizer HMR mode, and self-accept pattern. [VERIFIED: local source]
- Context7 Vite `/vitejs/vite/v8.0.10` docs — `transformIndexHtml`, Environment API `hotUpdate`, custom HMR event patterns. [CITED: https://github.com/vitejs/vite/blob/v8.0.10/docs/guide/api-plugin.md, https://github.com/vitejs/vite/blob/v8.0.10/docs/guide/api-environment-plugins.md]
- Context7 Vitest `/vitest-dev/vitest/v4.0.7` docs — focused test file execution and assertions. [CITED: https://github.com/vitest-dev/vitest/blob/v4.0.7/docs/api/index.md, https://github.com/vitest-dev/vitest/blob/v4.0.7/README.md]
- npm registry version checks for Vite, Vitest, Rolldown, `@qwik.dev/optimizer`, and vite-plus. [VERIFIED: npm registry]
- Research verification commands: focused tests passed; package and key fixture builds passed; explicit leakage `rg` returned no matches. [VERIFIED: command output]

### Secondary (MEDIUM confidence)

- `.planning/research/SUMMARY.md` — previous milestone-level research, now cross-checked against current Phase 2 verification and source. [VERIFIED: local source]

### Tertiary (LOW confidence)

- None. [VERIFIED: no unverified websearch-only sources used]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — package versions were verified via local package files, `pnpm exec`, and npm registry. [VERIFIED: package files and npm registry]
- Architecture: HIGH — current source, AGENTS constraints, upstream reference, and Phase 2 verification agree on boundaries. [VERIFIED: local source and upstream local source]
- Pitfalls: HIGH — pitfalls are derived from current seams, requirements, and observed tool behavior during fixture/output checks. [VERIFIED: command output and local source]

**Research date:** 2026-05-10  
**Valid until:** 2026-05-17 for Vite/Rolldown fast-moving APIs; 2026-06-09 for local project test/fixture patterns. [ASSUMED]
