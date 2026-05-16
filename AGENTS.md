# Qwik Bundler Project Rules

## Upstream Reference

When changing Vite, Rolldown, dev-server, HMR, manifest, optimizer, or static HTML behavior, compare against the local upstream Qwik Vite plugin first:

`/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins`

Use upstream to understand required behavior, but do not copy its complexity by default. This rewrite should stay simpler and easier to read unless a fixture or test proves the extra complexity is needed.

## Separation Of Concerns

- This package should provide Qwik bundling services only: optimizer transforms, runtime chunking, manifest/build artifacts, static HTML build helpers, and Vite/Rolldown integration.
- Do not add Qwik Router or app-framework conventions here. Router/app integrations should own entry defaults such as `src/root.tsx`, `src/entry.ssr`, and `src/entry.preview`.
- Preview middleware and app-specific path/output-dir wiring belong in router/app adapter layers, not in the core bundler plugin.
- Nitro and other meta-frameworks should not need to work around app/router assumptions in this package.
- `src/rolldown.ts` owns bundler integration, optimizer transforms, manifest creation, and output hooks.
- `src/vite.ts` owns Vite adapter wiring only.
- `src/build/*` owns production build helpers.
- Static HTML code should only mutate HTML assets using data it is given.
- HMR code should be split between dev segment handling, Vite HMR wiring, and browser bridge code.

## Static CSR Preloader

- Static CSR HTML does not go through Qwik SSR rendering, so render-time preloader injections are absent.
- Keep static CSR preloader handling isolated in `src/build/static-html.ts` and call it from the client output hook after the manifest exists.
- Skip SSR/SSG HTML using Qwik's `q:render="ssr"` / `q:render="ssr-dev"` marker so render-generated preloader tags are not duplicated.
- Treat current static HTML injection as a temporary local implementation. Prefer moving shared preloader/bootstrap tag generation upstream into Qwik core when available.
- Do not couple this to Qwik Router `DocumentHeadTags`; keep it target-agnostic.

## HMR Direction

- Vite should provide the full dev/HMR experience. Raw Rolldown should remain build/library/server tooling unless a separate dev server is intentionally added.
- HMR should be automatic in Vite serve and opt-out via `hmr: false`.
- Keep HMR implementation readable and separated:
    - dev segment resolution/loading
    - Vite HMR plugin/hooks and server-to-client forwarding
    - browser bridge code
- Avoid passing Vite server internals deep into generic dev segment code. Prefer narrow callbacks for actions like transforming a parent module.

## Known Architecture Context

- `@qwik.dev/bundler` is the intended package shape if this becomes standalone before moving upstream, with exports such as `@qwik.dev/bundler/vite` and `@qwik.dev/bundler/rolldown`.
- Singletons and HMR are major remaining areas before the rewrite feels complete.
- Qwik loader and Qwik preloader are different concerns: CSR templates may include `qwikloader.js`, but that does not provide bundle graph/modulepreload behavior.

## Code Style

- Make the smallest correct edit. Avoid broad rewrites when a targeted change solves the problem.
- Prefer small, direct helpers over broad abstractions.
- Use clear names over abbreviations, especially for regex constants and build helpers.
- Look for existing libraries when they remove meaningful code or reduce edge cases.
- Prefer `ufo` for URL handling and `pathe` for filesystem-style path handling instead of hand-rolled string logic.
- Do not rely on Node-only APIs in implementation code unless the feature is explicitly Node-only.
- Avoid compatibility branches unless backed by a fixture, test, or known real use case.
- Before finalizing non-trivial code, ask: “Is this easier to read than the upstream Qwik Vite implementation?”

## Verification

- For bug fixes and behavior changes, add a robust failing test before implementing the fix.
- The failing test should reproduce the real regression or missing behavior, not just assert implementation details.
- For shared bundler behavior, prefer fixture-backed coverage when practical, especially across CSR, SSR/Nitro, and library modes.
  Preserve CSR, SSR/Nitro, and library fixture behavior. Prefer focused tests first, then run broader checks when touching shared bundler behavior.

<!-- GSD:project-start source:PROJECT.md -->

## Project

**Qwik Bundler HMR Port**

This project implements Qwik Hot Module Replacement support for `qwik-bundler` Vite serve mode by porting the working behavior from the local `HMR` branch and restructuring it for readability. The work is for maintainers of the standalone Qwik bundler rewrite who need Vite development behavior to match Qwik expectations without pulling Vite-server details into generic bundler code.

**Core Value:** Vite serve mode supports Qwik HMR automatically, while `hmr: false` cleanly opts out and existing CSR, SSR/Nitro, and library behavior remains intact.

### Constraints

- **Architecture**: `src/rolldown.ts` remains focused on bundler integration, optimizer transforms, manifest creation, and output hooks.
- **Architecture**: `src/vite.ts` remains focused on Vite adapter wiring with minimal orchestration.
- **Separation**: HMR code is split into dev segment handling, Vite HMR transport/hooks, and browser bridge runtime code.
- **Dependency direction**: Generic dev segment code receives narrow callbacks instead of Vite server internals.
- **Runtime scope**: Raw Rolldown remains build/library/server tooling; full browser HMR belongs to Vite serve.
- **Verification**: Bug fixes and behavior changes need focused failing tests before implementation.
- **Compatibility**: Existing CSR, SSR/Nitro, and library fixture behavior must be preserved.
- **Simplicity**: Keep the rewrite easier to read than upstream Qwik Vite unless a fixture or test proves added complexity is necessary.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5.9.3 - implementation, tests, and fixtures in `src/**/*.ts`, `test/**/*.ts`, and `fixtures/**/*.ts*`; compiler options live in `tsconfig.json`.
- TSX / JSX via TypeScript - Qwik component fixtures in `fixtures/*/src/**/*.tsx`; optimizer transform enables `transpileTs` and `transpileJsx` in `src/rolldown.ts`.
- JavaScript ESM output - package exports `./dist/rolldown.mjs` and `./dist/vite.mjs` from `package.json`; emitted bundles use ESM format in `vite.config.ts`.
- YAML - workspace and lockfile metadata in `pnpm-workspace.yaml` and `pnpm-lock.yaml`.
- Markdown - project and fixture instructions in `README.md`, `fixtures/README.md`, and `AGENTS.md`.

## Runtime

- Node.js >=22 - required by `package.json` `engines.node`; fixture servers use Node APIs such as `node:http` and `node:fs/promises` in `fixtures/rolldown-h3/src/server.ts`.
- Browser ESM - client builds emit Qwik runtime chunks and static HTML preload tags from `src/rolldown.ts`, `src/build/chunking.ts`, and `src/build/static-html.ts`.
- pnpm 10.33.2 - declared by `package.json` `packageManager`.
- Lockfile: present at `pnpm-lock.yaml` with lockfile version `9.0`.
- Workspace: `pnpm-workspace.yaml` includes `.` and `fixtures/*`.

## Frameworks

- `@qwik.dev/optimizer` 2.1.0-beta.2 - primary optimizer boundary; `src/rolldown.ts` lazily creates `createOptimizer()` and calls `transformModules()`.
- Rolldown 1.0.0-rc.18 - bundler plugin API and peer dependency; `src/rolldown.ts` exports `qwik`, `qwikClient`, `qwikServer`, and `qwikLib`.
- Vite 8.0.10 - adapter and peer dependency; `src/vite.ts` wraps the Rolldown plugin as `vite-plugin-qwik`.
- Qwik core from pkg.pr.new - fixture runtime dependency; fixtures pin `@qwik.dev/core` to `https://pkg.pr.new/QwikDev/qwik/@qwik.dev/core@1f3647c` in `fixtures/*/package.json`.
- Vitest 4.1.5 resolved / `^4.0.18` declared - test runner configured by `vite.config.ts` with `environment: 'node'` and `include: ['test/**/*.test.ts']`.
- Fixture-backed smoke tests - test files under `test/*.test.ts` exercise `fixtures/rolldown-*`, `fixtures/vite-*`, and `fixtures/tsdown-library`.
- vite-plus 0.1.20 - repo task runner/config wrapper; scripts in `package.json` call `vp pack`, `vp test`, `vp check`, and `vp config`.
- TypeScript 5.9.3 - strict type checking via `tsconfig.json` with `strict`, `noUncheckedIndexedAccess`, and `moduleResolution: 'bundler'`.
- tsdown 0.21.10 - fixture library host in `fixtures/tsdown-library/package.json` and `fixtures/tsdown-library/tsdown.config.ts`.

## Key Dependencies

- `@qwik.dev/optimizer` 2.1.0-beta.2 - required for Qwik segment extraction, diagnostics, entry strategies, and transforms in `src/rolldown.ts`.
- `rolldown` 1.0.0-rc.18 - provides plugin hooks, output bundle types, code splitting options, and build execution in `src/rolldown.ts`, `src/build/chunking.ts`, and fixture `rolldown.config.ts` files.
- `vite` 8.0.10 - provides Vite plugin hooks, dev server integration, workspace root detection, and fixture builds in `src/vite.ts` and `src/qwik-external.ts`.
- `@qwik.dev/core` pkg.pr.new build - runtime dependency for fixtures, SSR rendering, Qwik loader/preloader/core chunks, and manifest detection in `fixtures/*/package.json` and `src/build/manifest.ts`.
- `pathe` 2.0.3 - filesystem-style path resolution and normalization in `src/rolldown.ts`, `src/dev.ts`, `src/build/manifest.ts`, and `src/qwik-external.ts`; prefer this over hand-rolled path logic.
- `ufo` 1.6.4 - URL and module id path handling in `src/rolldown.ts`, `src/dev.ts`, and `src/build/static-html.ts`; prefer this for URL joins/parsing.
- `@types/node` 24.12.2 resolved / `^24.10.1` declared - Node type support for implementation tests and fixtures.

## Configuration

- No `.env` files detected in the repository root.
- Node engine is configured in `package.json` as `>=22`.
- Fixture HTTP ports read `PORT` with fallback `4173` in `fixtures/rolldown-h3/src/server.ts`, `fixtures/rolldown-hono/src/server.ts`, and `fixtures/rolldown-library-consumer/src/server.ts`.
- Vite serve mode enables dev behavior through `configResolved()` in `src/vite.ts`; HMR/dev segment loading uses the narrow `QwikDevServer` interface in `src/dev.ts`.
- `vite.config.ts` defines package entry points `./src/rolldown.ts` and `./src/vite.ts`, ESM format, DTS output, test matching, lint ignores, and formatting rules.
- `tsconfig.json` targets `ESNext`, uses `moduleResolution: 'bundler'`, includes `src` and `vite.config.ts`, and emits no files during type checking.
- `package.json` exports only `./rolldown`, `./vite`, and `./package.json`; new public APIs must be routed through these entry points.
- Rolldown fixtures configure host-owned client/server/library builds in `fixtures/rolldown-h3/rolldown.config.ts`, `fixtures/rolldown-hono/rolldown.config.ts`, and `fixtures/rolldown-library/rolldown.config.ts`.
- Vite fixtures configure host-owned plugin stacks in `fixtures/vite-csr/vite.config.ts`, `fixtures/vite-nitro-v3/vite.config.ts`, `fixtures/vite-qwik-router/vite.config.ts`, and `fixtures/vite-library/vite.config.ts`.

## Platform Requirements

- Use Node.js 22 or newer and pnpm 10.33.2 as specified in `package.json`.
- Run `pnpm build` before fixture builds so workspace fixtures resolve `qwik-bundler` output, as documented in `README.md` and `fixtures/README.md`.
- Use `pnpm test` for all tests, `pnpm test:watch` for watch mode, and `pnpm check` for type/lint/format checks from `package.json`.
- Keep framework entry defaults inside fixture/app host configs; core bundler entry points remain `src/rolldown.ts` and `src/vite.ts` per `AGENTS.md`.
- Package output is ESM-only under `dist/` with public exports declared in `package.json`.
- Client builds emit `build/q-[hash].js`, `build/bundle-graph.json`, and `q-manifest.json` from `src/rolldown.ts` and `src/build/chunking.ts`.
- Server/library host targets are owned by consumers; fixtures demonstrate Node server output in `fixtures/rolldown-h3/server`, `fixtures/rolldown-hono/server`, and Nitro output `.output/server/index.mjs` from `fixtures/vite-nitro-v3/package.json`.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Use lowercase kebab-case for multiword source modules: `src/build/static-html.ts`, `src/qwik-external.ts`.
- Use short domain names for top-level adapters: `src/rolldown.ts`, `src/vite.ts`, `src/dev.ts`, `src/features.ts`.
- Place build-specific helpers under `src/build/`: `src/build/chunking.ts`, `src/build/manifest.ts`, `src/build/static-html.ts`.
- Name tests by feature with `.test.ts` under `test/`: `test/rolldown-transform.test.ts`, `test/vite-config.test.ts`, `test/static-html.test.ts`.
- Name fixture source files after app entry roles: `fixtures/vite-csr/src/root.tsx`, `fixtures/vite-csr/src/main.tsx`, `fixtures/rolldown-hono/src/server.ts`.
- Use camelCase for regular functions and helpers: `outputDefaults` in `src/build/chunking.ts`, `createManifest` in `src/build/manifest.ts`, `injectQwikPreloaderTags` in `src/build/static-html.ts`.
- Use `create*` for factories that return configured service/plugin objects: `createQwikDev` in `src/dev.ts`, `createOptimizer` usage in `src/rolldown.ts`, `createQwikExternal` in `src/qwik-external.ts`.
- Use direct verb names for transform or lookup helpers: `transform`, `reportDiagnostics`, `stripBuildPrefix`, `sourceImporter`, and `pathname` in `src/rolldown.ts`.
- Use `call*` for test hook invokers: `callTransform`, `callResolveId`, `callGenerateBundle`, and `callConfigResolved` in `test/helpers.ts`.
- Use camelCase for local variables and mutable state: `currentEnvironment`, `missingManifestWarned`, `clientManifest`, and `currentRoot` in `src/rolldown.ts`.
- Use clear booleans with affirmative meaning: `handlers` and `missingManifestWarned` in `src/rolldown.ts`, `enabled` in `src/dev.ts`.
- Use descriptive collection names for maps/sets: `segments`, `symbols`, `manifests` in `src/rolldown.ts`, `parents` in `src/dev.ts`, `externals` in `src/qwik-external.ts`.
- Use `next` when creating a derived config object from input: `next` in `src/rolldown.ts` and `src/build/chunking.ts`.
- Use PascalCase for exported interfaces and type aliases: `QwikRolldownOptions` and `QwikEnvironment` in `src/rolldown.ts`, `QwikManifest` and `ServerQwikManifest` in `src/build/manifest.ts`.
- Prefix exported Qwik-specific types with `Qwik`: `QwikBundle`, `QwikAsset`, `QwikSymbol`, `QwikDevServer`.
- Keep internal helper types concise and local to the owning file: `EmitFile`, `TransformContext`, and `Environment` in `src/rolldown.ts`; `AssetPaths` in `src/build/static-html.ts`; `HookContext` in `test/helpers.ts`.
- Use `type` for unions, aliases, and lightweight object shapes; use `interface` for exported option/config contracts such as `QwikRolldownOptions` and `VitePluginOptions`.

## Code Style

- Formatting is configured through `vite-plus` in `vite.config.ts`.
- Use tabs with width 4: `fmt.useTabs: true`, `fmt.tabWidth: 4` in `vite.config.ts`.
- Use single quotes and LF endings: `fmt.singleQuote: true`, `fmt.endOfLine: 'lf'` in `vite.config.ts`.
- Keep lines around 100 columns: `fmt.printWidth: 100` in `vite.config.ts`.
- Prefer compact guard clauses for early exits: `if (item.type !== 'asset') continue;` in `src/build/static-html.ts`, `if (!enabled()) return null;` style in `src/dev.ts`.
- Linting is run by `vite-plus` through `vp check` in `package.json` and configured in `vite.config.ts`.
- Ignore generated/runtime directories in lint and format checks: `dist/**` and `node_modules/**` in `vite.config.ts`.
- Pre-commit staged files use `vp check --fix` through `staged` config in `vite.config.ts`.
- TypeScript is strict: `strict: true`, `noUncheckedIndexedAccess: true`, and `verbatimModuleSyntax: true` in `tsconfig.json`.

## Import Organization

- No TypeScript path aliases are configured in `tsconfig.json`; use relative imports for local source and test helpers.
- Use package imports for public dependencies: `@qwik.dev/optimizer`, `pathe`, `ufo`, `rolldown`, and `vite`.
- Use relative paths from tests to source: `../src/rolldown`, `../src/vite`, and `../src/build/manifest` in `test/*.test.ts`.

## Error Handling

- Convert plugin failures to Rollup/Rolldown-style errors with an `id`, `plugin`, and empty `stack`: `createPluginError` in `src/rolldown.ts`.
- Report optimizer diagnostics through the plugin context instead of throwing directly: `reportDiagnostics` calls `context.error` for `category === 'error'` and `context.warn` otherwise in `src/rolldown.ts`.
- Throw a normal `Error` only for invalid direct API/config usage: boolean `codeSplitting` throws in `src/build/chunking.ts`.
- Use nullable returns to express “not handled” in plugin hooks: `return null` in `resolveId`, `load`, and `transform` paths in `src/rolldown.ts`, `src/dev.ts`, and `src/qwik-external.ts`.
- In tests, throw explicit assertion guard errors only after runtime shape checks: `throw new Error('Expected transformed code')` in `test/manifest.test.ts`.

## Logging

- Do not log from core library code in `src/`; use plugin warnings/errors through context APIs in `src/rolldown.ts`.
- Fixture servers may log listening URLs for manual/integration use: `fixtures/rolldown-hono/src/server.ts`, `fixtures/rolldown-h3/src/server.ts`, `fixtures/rolldown-library-consumer/src/server.ts`.
- Tests assert warning/error callbacks with `vi.fn()` instead of relying on console output: `test/rolldown-transform.test.ts`, `test/manifest.test.ts`.

## Comments

- Use comments sparingly to explain non-obvious bundler constraints, not ordinary control flow: static CSR preloader rationale in `src/build/static-html.ts`.
- TODO comments are acceptable when tied to external upstream direction or known evolution: `src/rolldown.ts`, `src/vite.ts`, and `src/build/static-html.ts`.
- Prefer descriptive constant names over explanatory comments for regexes and magic module IDs: `QWIK_CORE_OR_HANDLERS_MODULE` in `src/build/chunking.ts`, `MODULE_SCRIPT_TAG` in `src/build/static-html.ts`.
- Not used in current source files. Prefer exported interfaces and clear names over JSDoc unless documenting a public API edge case in `src/rolldown.ts` or `src/vite.ts`.

## Function Design

## Module Design

- Export public adapter APIs from top-level modules: `qwik`, `qwikClient`, `qwikServer`, `qwikLib`, and `plugin` from `src/rolldown.ts`; `qwik` from `src/vite.ts`.
- Export build helpers only when used across modules or tests: `outputDefaults` from `src/build/chunking.ts`, `createManifest`, `injectManifest`, and constants from `src/build/manifest.ts`.
- Keep implementation helpers file-local unless reused: `scriptBundle` in `src/build/static-html.ts`, `entryStrategy` in `src/rolldown.ts`, `transformDevParent` in `src/dev.ts`.
- No source barrel files are used. Package exports map directly to built entry modules in `package.json`: `./rolldown` and `./vite`.
- Add new public entry points by adding a source module under `src/`, updating `vite.config.ts` pack entries, and updating `package.json` exports.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component              | Responsibility                                                                                                                                                          | File                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Rolldown Qwik plugin   | Own optimizer lifecycle, virtual Qwik segment modules, client/server/lib environment behavior, manifest handoff, and output hooks.                                      | `src/rolldown.ts`          |
| Vite adapter           | Wrap the Rolldown plugin as `vite-plugin-qwik`, infer Vite build environment, set Vite defaults, expose `api.getManifest()`, and pass Vite dev server context into HMR. | `src/vite.ts`              |
| Dev segment support    | Resolve development QRL segment URLs, lazily transform parents through the Vite dev server, and register dev-path aliases for generated segments.                       | `src/dev.ts`               |
| Output chunking        | Apply Qwik output defaults and runtime code-splitting groups for core, loader, preloader, and bundle graph assets.                                                      | `src/build/chunking.ts`    |
| Manifest creation      | Build `q-manifest.json`, symbol mappings, bundle graph records, runtime bundle detection, and server-side manifest replacement.                                         | `src/build/manifest.ts`    |
| Static HTML mutation   | Inject preloader, bundle graph fetch, and reachable modulepreload tags into CSR HTML assets after the client manifest exists.                                           | `src/build/static-html.ts` |
| Feature defines        | Set `globalThis.qDev` and Qwik `__EXPERIMENTAL__.*` compile-time values.                                                                                                | `src/features.ts`          |
| Qwik external handling | Keep Qwik-generated `.qwik.*` output bundled, apply Vite `noExternal` defaults for Qwik framework packages, and preserve user externals.                                | `src/qwik-external.ts`     |
| Test hook harness      | Invoke Vite/Rolldown plugin hooks directly in unit tests.                                                                                                               | `test/helpers.ts`          |

## Pattern Overview

- Keep bundler integration centered in `src/rolldown.ts`; use helper modules only for isolated concerns such as HMR in `src/dev.ts`, manifest output in `src/build/manifest.ts`, and static HTML mutation in `src/build/static-html.ts`.
- Export small public entry points from `package.json`: `qwik-bundler/rolldown` maps to `dist/rolldown.mjs`, and `qwik-bundler/vite` maps to `dist/vite.mjs`.
- Treat Vite as an adapter layer. `src/vite.ts` must not own optimizer behavior; it configures Vite and delegates to `plugin()` from `src/rolldown.ts`.
- Use in-memory maps inside plugin instances for transform state: `segments`, `symbols`, and the root-keyed `manifests` map in `src/rolldown.ts`.
- Use host application config for entries, adapters, output directories, and router behavior; fixtures show this contract in `fixtures/README.md`.

## Layers

- Purpose: expose the plugin constructors consumed by fixture apps and downstream packages.
- Location: `src/rolldown.ts`, `src/vite.ts`, `package.json`
- Contains: `qwik()`, `qwikClient()`, `qwikServer()`, `qwikLib()`, and the Vite `qwik()` adapter.
- Depends on: Rolldown `Plugin`, Vite `Plugin`, `@qwik.dev/optimizer` types, internal build helpers.
- Used by: fixture configs such as `fixtures/rolldown-hono/rolldown.config.ts`, `fixtures/vite-csr/vite.config.ts`, and `fixtures/vite-qwik-router/vite.config.ts`.
- Purpose: translate Rolldown/Vite lifecycle hooks into optimizer calls and Qwik-specific virtual modules.
- Location: `src/rolldown.ts`
- Contains: `options`, `buildStart`, `outputOptions`, `resolveId`, `load`, `transform`, and `generateBundle` hook implementations.
- Depends on: `@qwik.dev/optimizer`, `src/dev.ts`, `src/build/chunking.ts`, `src/build/manifest.ts`, `src/build/static-html.ts`, `src/features.ts`, `src/qwik-external.ts`.
- Used by: Vite via `src/vite.ts` and direct Rolldown consumers via `qwik-bundler/rolldown`.
- Purpose: map Vite configuration and multi-environment context onto the generic Rolldown plugin.
- Location: `src/vite.ts`
- Contains: Vite plugin identity `vite-plugin-qwik`, environment detection, Vite config defaults, and dev server handoff.
- Depends on: `src/rolldown.ts`, `src/build/chunking.ts`, `src/qwik-external.ts`.
- Used by: Vite fixtures such as `fixtures/vite-csr/vite.config.ts`, `fixtures/vite-nitro-v3/vite.config.ts`, and `fixtures/vite-qwik-router/vite.config.ts`.
- Purpose: create artifacts and defaults needed by production Qwik output.
- Location: `src/build/`
- Contains: chunk naming/defaults in `src/build/chunking.ts`, manifest and graph generation in `src/build/manifest.ts`, and static CSR HTML preloader injection in `src/build/static-html.ts`.
- Depends on: Rolldown output types, `pathe`, `ufo`, and optimizer segment metadata.
- Used by: `generateBundle` and `outputOptions` hooks in `src/rolldown.ts`.
- Purpose: resolve optimizer-generated dev QRL modules without adding a standalone dev server.
- Location: `src/dev.ts`
- Contains: `createQwikDev()`, `parseDevQrl()`, `devSegmentPaths()`, and `transformDevParent()`.
- Depends on: narrow `QwikDevServer` callbacks rather than raw Vite server internals.
- Used by: `resolveId`, `load`, and `transform` hooks in `src/rolldown.ts`; Vite injects the server through `src/vite.ts`.
- Purpose: keep Qwik output bundleable while respecting user externalization and Vite environment resolution.
- Location: `src/qwik-external.ts`
- Contains: `qwikExternal()`, `qwikViteExternal()`, Qwik runtime defaults, and `.qwik.` output checks.
- Depends on: Rolldown external option shapes, Vite config hooks, and `pathe`.
- Used by: both `src/rolldown.ts` and `src/vite.ts`.
- Purpose: exercise real host-native integration modes without baking app conventions into the plugin.
- Location: `fixtures/`, `test/`
- Contains: Vite CSR, Vite Router, Nitro, Rolldown server, library, consumer, and tsdown fixtures; unit tests around plugin hooks and artifact helpers.
- Depends on: built package output and workspace resolution.
- Used by: maintainers validating CSR, SSR/Nitro, library, and runtime behavior.

## Data Flow

### Primary Build Transform Path

### QRL Segment Resolution Path

### Client Manifest and Static HTML Path

### Vite Serve/HMR Path

- Keep per-plugin mutable state inside the `plugin()` closure in `src/rolldown.ts`: `segments`, `symbols`, `manifest`, `optimizer`, root, handler flags, and missing-manifest warning flags.
- Use the module-level `manifests` map in `src/rolldown.ts:53` only for root-scoped client-to-server manifest sharing.
- Keep development parent lookup state inside `createQwikDev()` in `src/dev.ts:27`.

## Key Abstractions

- Purpose: distinguish client, server, and library behavior.
- Examples: `src/rolldown.ts:26`, `src/vite.ts:79`, `src/build/chunking.ts:30`
- Pattern: use an explicit union `'client' | 'server' | 'lib'`; do not infer behavior from filenames.
- Purpose: share plugin options across direct Rolldown use and Vite adapter use.
- Examples: `src/rolldown.ts:28`, `src/vite.ts:8`
- Pattern: Vite mutates a cloned options object to add root, dev mode, and dev server (`src/vite.ts:13`).
- Purpose: represent optimizer-generated Qwik segment modules as bundler-loadable modules.
- Examples: `src/rolldown.ts:50`, `src/rolldown.ts:389`, `test/vite-plugin.test.ts:139`
- Pattern: encode IDs as `\0qwik:segment:<environment>:<path>` and decode source importers with `sourceImporter()`.
- Purpose: map Qwik symbols to bundles and describe preload/runtime relationships.
- Examples: `src/build/manifest.ts:5`, `src/build/manifest.ts:68`, `src/build/manifest.ts:211`
- Pattern: collect chunk facts from `OutputBundle`, sort records for stable output, then hash the final manifest.
- Purpose: derive public and build paths from module script tags in generated CSR HTML.
- Examples: `src/build/static-html.ts:82`, `src/build/static-html.ts:84`
- Pattern: infer paths from existing HTML bundle URLs; do not inject router-specific assumptions.
- Purpose: wrap user external config so Qwik generated output remains bundleable.
- Examples: `src/qwik-external.ts:17`, `src/qwik-external.ts:113`
- Pattern: delegate to the user external setting first, then override `.qwik.` outputs and unresolved bare imports as needed.

## Entry Points

- Location: `src/rolldown.ts:55`
- Triggers: imported from `qwik-bundler/rolldown` or `dist/rolldown.mjs`.
- Responsibilities: default to client optimizer mode and Qwik production chunk/manifest behavior.
- Location: `src/rolldown.ts:56`, `src/rolldown.ts:57`, `src/rolldown.ts:58`
- Triggers: host configs that need client, server, or library-specific plugin instances.
- Responsibilities: select environment-specific entry strategy and output behavior.
- Location: `src/rolldown.ts:60`
- Triggers: Vite adapter and direct exported constructors.
- Responsibilities: build the Rolldown plugin object and own all hook state.
- Location: `src/vite.ts:12`
- Triggers: imported from `qwik-bundler/vite` or `dist/vite.mjs`.
- Responsibilities: expose Vite-compatible plugin array, set config defaults, wire dev mode, and delegate transforms.
- Location: `vite.config.ts:3`
- Triggers: `pnpm build` via `vp pack` from `package.json:15`.
- Responsibilities: build `src/rolldown.ts` and `src/vite.ts` as ESM package entries with declarations.
- Location: `vite.config.ts:14`
- Triggers: `pnpm test` via `vp test` from `package.json:16`.
- Responsibilities: run `test/**/*.test.ts` in the Node environment.

## Architectural Constraints

- **Threading:** The implementation is single-process and hook-driven; async work occurs in bundler hooks and optimizer calls in `src/rolldown.ts` and dev server callbacks in `src/dev.ts`.
- **Global state:** `src/rolldown.ts:53` has a module-level `manifests` map keyed by root; keep other build state inside plugin closures.
- **Circular imports:** `src/rolldown.ts` imports helpers from `src/dev.ts`, while `src/dev.ts` imports only the `QwikEnvironment` type from `src/rolldown.ts`. Preserve the type-only dependency to avoid runtime cycles.
- **Environment selection:** `src/vite.ts:79` derives environment from Vite hook context. Direct Rolldown usage should pass explicit `qwikClient()`, `qwikServer()`, or `qwikLib()` when context cannot identify the environment.
- **Separation from app/router conventions:** Do not add defaults such as `src/root.tsx`, `src/entry.ssr.tsx`, or preview middleware to core plugin files. Fixtures such as `fixtures/vite-qwik-router/src/entry.ssr.tsx` demonstrate app-owned entries.
- **Static HTML scope:** Only mutate HTML assets using manifest/build data in `src/build/static-html.ts`; skip SSR/SSG HTML marked with `q:render="ssr"` or `q:render="ssr-dev"`.

## Anti-Patterns

### Moving Vite Behavior Into Core Rolldown Logic

### Adding App Framework Defaults To The Bundler

### Hand-Rolling URL Or Path Parsing

### Mixing Manifest Generation With HTML Injection

## Error Handling

- Use `createPluginError()` in `src/rolldown.ts:365` to add `id`, `plugin: 'qwik'`, and an empty stack to Rolldown errors.
- Use `reportDiagnostics()` in `src/rolldown.ts:348` to route optimizer `error` diagnostics to `context.error()` and non-error diagnostics to `context.warn()`.
- Warn once when server code references `globalThis.__QWIK_MANIFEST__` without an available client manifest (`src/rolldown.ts:251`).
- Throw for unsupported boolean `output.codeSplitting` because Qwik runtime chunks require grouped object configuration (`src/build/chunking.ts:48`).
- Return `null` or `undefined` from hook helpers for non-applicable modules instead of throwing (`src/rolldown.ts:217`, `src/dev.ts:40`, `src/qwik-external.ts:132`).

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.

<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.

<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.

<!-- GSD:profile-end -->
