<!-- refreshed: 2026-05-09 -->

# Architecture

**Analysis Date:** 2026-05-09

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                    Public Package Exports                    │
├──────────────────────────────┬──────────────────────────────┤
│ Rolldown plugin API          │ Vite plugin adapter           │
│ `src/rolldown.ts`            │ `src/vite.ts`                 │
└──────────────┬───────────────┴──────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Bundler Hook Orchestration                  │
│ `src/rolldown.ts`, `src/qwik-external.ts`                    │
└──────────────┬───────────────┬──────────────┬───────────────┘
               │               │              │
               ▼               ▼              ▼
┌──────────────────┬──────────────────┬───────────────────────┐
│ Optimizer/HMR    │ Build Artifacts   │ Feature Defines       │
│ `src/dev.ts`     │ `src/build/*`     │ `src/features.ts`     │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Rolldown/Vite output: Qwik chunks, manifest, bundle graph,   │
│ static HTML preloader mutations, server manifest injection    │
└─────────────────────────────────────────────────────────────┘
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

**Overall:** Thin adapter plus hook-oriented bundler plugin.

**Key Characteristics:**

- Keep bundler integration centered in `src/rolldown.ts`; use helper modules only for isolated concerns such as HMR in `src/dev.ts`, manifest output in `src/build/manifest.ts`, and static HTML mutation in `src/build/static-html.ts`.
- Export small public entry points from `package.json`: `qwik-bundler/rolldown` maps to `dist/rolldown.mjs`, and `qwik-bundler/vite` maps to `dist/vite.mjs`.
- Treat Vite as an adapter layer. `src/vite.ts` must not own optimizer behavior; it configures Vite and delegates to `plugin()` from `src/rolldown.ts`.
- Use in-memory maps inside plugin instances for transform state: `segments`, `symbols`, and the root-keyed `manifests` map in `src/rolldown.ts`.
- Use host application config for entries, adapters, output directories, and router behavior; fixtures show this contract in `fixtures/README.md`.

## Layers

**Public API Layer:**

- Purpose: expose the plugin constructors consumed by fixture apps and downstream packages.
- Location: `src/rolldown.ts`, `src/vite.ts`, `package.json`
- Contains: `qwik()`, `qwikClient()`, `qwikServer()`, `qwikLib()`, and the Vite `qwik()` adapter.
- Depends on: Rolldown `Plugin`, Vite `Plugin`, `@qwik.dev/optimizer` types, internal build helpers.
- Used by: fixture configs such as `fixtures/rolldown-hono/rolldown.config.ts`, `fixtures/vite-csr/vite.config.ts`, and `fixtures/vite-qwik-router/vite.config.ts`.

**Bundler Hook Layer:**

- Purpose: translate Rolldown/Vite lifecycle hooks into optimizer calls and Qwik-specific virtual modules.
- Location: `src/rolldown.ts`
- Contains: `options`, `buildStart`, `outputOptions`, `resolveId`, `load`, `transform`, and `generateBundle` hook implementations.
- Depends on: `@qwik.dev/optimizer`, `src/dev.ts`, `src/build/chunking.ts`, `src/build/manifest.ts`, `src/build/static-html.ts`, `src/features.ts`, `src/qwik-external.ts`.
- Used by: Vite via `src/vite.ts` and direct Rolldown consumers via `qwik-bundler/rolldown`.

**Vite Adapter Layer:**

- Purpose: map Vite configuration and multi-environment context onto the generic Rolldown plugin.
- Location: `src/vite.ts`
- Contains: Vite plugin identity `vite-plugin-qwik`, environment detection, Vite config defaults, and dev server handoff.
- Depends on: `src/rolldown.ts`, `src/build/chunking.ts`, `src/qwik-external.ts`.
- Used by: Vite fixtures such as `fixtures/vite-csr/vite.config.ts`, `fixtures/vite-nitro-v3/vite.config.ts`, and `fixtures/vite-qwik-router/vite.config.ts`.

**Build Artifact Layer:**

- Purpose: create artifacts and defaults needed by production Qwik output.
- Location: `src/build/`
- Contains: chunk naming/defaults in `src/build/chunking.ts`, manifest and graph generation in `src/build/manifest.ts`, and static CSR HTML preloader injection in `src/build/static-html.ts`.
- Depends on: Rolldown output types, `pathe`, `ufo`, and optimizer segment metadata.
- Used by: `generateBundle` and `outputOptions` hooks in `src/rolldown.ts`.

**Development/HMR Layer:**

- Purpose: resolve optimizer-generated dev QRL modules without adding a standalone dev server.
- Location: `src/dev.ts`
- Contains: `createQwikDev()`, `parseDevQrl()`, `devSegmentPaths()`, and `transformDevParent()`.
- Depends on: narrow `QwikDevServer` callbacks rather than raw Vite server internals.
- Used by: `resolveId`, `load`, and `transform` hooks in `src/rolldown.ts`; Vite injects the server through `src/vite.ts`.

**External/Dependency Layer:**

- Purpose: keep Qwik output bundleable while respecting user externalization and Vite dependency crawling.
- Location: `src/qwik-external.ts`
- Contains: `qwikExternal()`, `qwikViteExternal()`, Qwik package detection, and `.qwik.` output checks.
- Depends on: Rolldown external option shapes, Vite config hooks, `vitefu`, and `pathe`.
- Used by: both `src/rolldown.ts` and `src/vite.ts`.

**Fixture/Verification Layer:**

- Purpose: exercise real host-native integration modes without baking app conventions into the plugin.
- Location: `fixtures/`, `test/`
- Contains: Vite CSR, Vite Router, Nitro, Rolldown server, library, consumer, and tsdown fixtures; unit tests around plugin hooks and artifact helpers.
- Depends on: built package output and workspace resolution.
- Used by: maintainers validating CSR, SSR/Nitro, library, and runtime behavior.

## Data Flow

### Primary Build Transform Path

1. A host config loads a public plugin entry such as `qwik()` from `src/rolldown.ts:55` or `src/vite.ts:12`.
2. The `options` hook applies feature defines via `defineQwik()` and client output signature defaults (`src/rolldown.ts:99`).
3. The `buildStart` hook records the root and picks up an explicit or cached manifest for server builds (`src/rolldown.ts:109`).
4. The `transform` hook replaces experimental globals, filters source files, and sends TS/JSX input into `optimizer.transformModules()` (`src/rolldown.ts:224`, `src/rolldown.ts:296`).
5. Optimizer segment modules are stored in `segments`; client segment metadata is stored in `symbols` and emitted as chunks outside dev mode (`src/rolldown.ts:314`).
6. The transformed primary module is returned to Rolldown/Vite (`src/rolldown.ts:330`).

### QRL Segment Resolution Path

1. A transformed module imports a generated QRL segment path.
2. `resolveId` first checks development-only QRL resolution through `dev.resolveId()` (`src/rolldown.ts:131`).
3. Production segment imports are encoded as virtual IDs using `segmentId(environment, path)` (`src/rolldown.ts:194`, `src/rolldown.ts:389`).
4. `load` returns generated segment code from the `segments` map (`src/rolldown.ts:217`).
5. Relative imports from segment modules resolve against the original segment parent source through `sourceImporter()` and parent origin handling (`src/rolldown.ts:190`, `src/rolldown.ts:393`).

### Client Manifest and Static HTML Path

1. Client `generateBundle` creates a manifest from Rolldown output chunks and optimizer symbol metadata (`src/rolldown.ts:263`, `src/build/manifest.ts:68`).
2. The manifest is cached by root for later server builds and emitted to `options.onManifest` (`src/rolldown.ts:272`).
3. Static CSR HTML assets are mutated by `injectQwikPreloaderTags()` after manifest creation (`src/rolldown.ts:278`, `src/build/static-html.ts:17`).
4. `build/bundle-graph.json` and `q-manifest.json` are emitted as assets (`src/rolldown.ts:280`).
5. Server transforms replace `globalThis.__QWIK_MANIFEST__` with the available server-safe manifest subset (`src/rolldown.ts:248`, `src/build/manifest.ts:193`).

### Vite Serve/HMR Path

1. Vite calls `configResolved`, setting `rolldownOptions.dev` and `rolldownOptions.rootDir` (`src/vite.ts:31`).
2. Vite calls `configureServer`, passing a narrow dev server interface into the shared options object (`src/vite.ts:35`).
3. `createQwikDev()` adds `devPath` to optimizer input in serve mode (`src/dev.ts:32`).
4. A requested dev QRL path is parsed by `parseDevQrl()` and mapped to a virtual segment ID (`src/dev.ts:44`, `src/dev.ts:93`).
5. If the segment is not loaded yet, `transformDevParent()` asks the Vite environment server to transform the parent module (`src/dev.ts:71`, `src/dev.ts:122`).

**State Management:**

- Keep per-plugin mutable state inside the `plugin()` closure in `src/rolldown.ts`: `segments`, `symbols`, `manifest`, `optimizer`, root, handler flags, and missing-manifest warning flags.
- Use the module-level `manifests` map in `src/rolldown.ts:53` only for root-scoped client-to-server manifest sharing.
- Keep development parent lookup state inside `createQwikDev()` in `src/dev.ts:27`.

## Key Abstractions

**QwikEnvironment:**

- Purpose: distinguish client, server, and library behavior.
- Examples: `src/rolldown.ts:26`, `src/vite.ts:79`, `src/build/chunking.ts:30`
- Pattern: use an explicit union `'client' | 'server' | 'lib'`; do not infer behavior from filenames.

**QwikRolldownOptions / VitePluginOptions:**

- Purpose: share plugin options across direct Rolldown use and Vite adapter use.
- Examples: `src/rolldown.ts:28`, `src/vite.ts:8`
- Pattern: Vite mutates a cloned options object to add root, dev mode, and dev server (`src/vite.ts:13`).

**Virtual Segment ID:**

- Purpose: represent optimizer-generated Qwik segment modules as bundler-loadable modules.
- Examples: `src/rolldown.ts:50`, `src/rolldown.ts:389`, `test/vite-plugin.test.ts:139`
- Pattern: encode IDs as `\0qwik:segment:<environment>:<path>` and decode source importers with `sourceImporter()`.

**Qwik Manifest:**

- Purpose: map Qwik symbols to bundles and describe preload/runtime relationships.
- Examples: `src/build/manifest.ts:5`, `src/build/manifest.ts:68`, `src/build/manifest.ts:211`
- Pattern: collect chunk facts from `OutputBundle`, sort records for stable output, then hash the final manifest.

**Static HTML Asset Paths:**

- Purpose: derive public and build paths from module script tags in generated CSR HTML.
- Examples: `src/build/static-html.ts:82`, `src/build/static-html.ts:84`
- Pattern: infer paths from existing HTML bundle URLs; do not inject router-specific assumptions.

**External Resolver:**

- Purpose: wrap user external config so Qwik generated output remains bundleable.
- Examples: `src/qwik-external.ts:17`, `src/qwik-external.ts:113`
- Pattern: delegate to the user external setting first, then override `.qwik.` outputs and unresolved bare imports as needed.

## Entry Points

**Rolldown client plugin:**

- Location: `src/rolldown.ts:55`
- Triggers: imported from `qwik-bundler/rolldown` or `dist/rolldown.mjs`.
- Responsibilities: default to client optimizer mode and Qwik production chunk/manifest behavior.

**Rolldown explicit environment plugins:**

- Location: `src/rolldown.ts:56`, `src/rolldown.ts:57`, `src/rolldown.ts:58`
- Triggers: host configs that need client, server, or library-specific plugin instances.
- Responsibilities: select environment-specific entry strategy and output behavior.

**Generic plugin factory:**

- Location: `src/rolldown.ts:60`
- Triggers: Vite adapter and direct exported constructors.
- Responsibilities: build the Rolldown plugin object and own all hook state.

**Vite plugin:**

- Location: `src/vite.ts:12`
- Triggers: imported from `qwik-bundler/vite` or `dist/vite.mjs`.
- Responsibilities: expose Vite-compatible plugin array, set config defaults, wire dev mode, and delegate transforms.

**Package build config:**

- Location: `vite.config.ts:3`
- Triggers: `pnpm build` via `vp pack` from `package.json:15`.
- Responsibilities: build `src/rolldown.ts` and `src/vite.ts` as ESM package entries with declarations.

**Test runner config:**

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

**What happens:** Vite-specific dev server, config, or environment assumptions are added to `src/rolldown.ts`.
**Why it's wrong:** `src/rolldown.ts` is the generic bundler integration used by direct Rolldown fixtures such as `fixtures/rolldown-hono/rolldown.config.ts`; Vite-only concerns make non-Vite consumers fragile.
**Do this instead:** Put Vite wiring in `src/vite.ts` and pass narrow callbacks/options into `src/rolldown.ts` or `src/dev.ts`.

### Adding App Framework Defaults To The Bundler

**What happens:** The plugin assumes router entry files, server adapters, preview middleware, or output directories.
**Why it's wrong:** `fixtures/README.md` states fixtures intentionally use host config for entries, output, server adapters, router plugins, and library mode.
**Do this instead:** Keep host/app conventions in fixture or adapter configs such as `fixtures/vite-qwik-router/vite.config.ts` and keep core code target-agnostic.

### Hand-Rolling URL Or Path Parsing

**What happens:** String slicing replaces `ufo` or `pathe` for path/URL parsing in core modules.
**Why it's wrong:** The implementation already standardizes on `parsePath`, `joinURL`, `isRelative`, `resolve`, `dirname`, `relative`, and `normalize` in `src/rolldown.ts`, `src/dev.ts`, `src/build/static-html.ts`, and `src/qwik-external.ts`.
**Do this instead:** Use `ufo` for URL-like module IDs and `pathe` for filesystem-like paths.

### Mixing Manifest Generation With HTML Injection

**What happens:** Static HTML code starts creating manifest entries, or manifest code starts mutating HTML.
**Why it's wrong:** Manifest construction in `src/build/manifest.ts` and static CSR preloader injection in `src/build/static-html.ts` are deliberately separate.
**Do this instead:** Build manifest data in `src/build/manifest.ts`, then pass the completed manifest into `injectQwikPreloaderTags()` from `src/build/static-html.ts`.

## Error Handling

**Strategy:** Convert optimizer diagnostics and bundler configuration failures into bundler-native errors/warnings with plugin metadata.

**Patterns:**

- Use `createPluginError()` in `src/rolldown.ts:365` to add `id`, `plugin: 'qwik'`, and an empty stack to Rolldown errors.
- Use `reportDiagnostics()` in `src/rolldown.ts:348` to route optimizer `error` diagnostics to `context.error()` and non-error diagnostics to `context.warn()`.
- Warn once when server code references `globalThis.__QWIK_MANIFEST__` without an available client manifest (`src/rolldown.ts:251`).
- Throw for unsupported boolean `output.codeSplitting` because Qwik runtime chunks require grouped object configuration (`src/build/chunking.ts:48`).
- Return `null` or `undefined` from hook helpers for non-applicable modules instead of throwing (`src/rolldown.ts:217`, `src/dev.ts:40`, `src/qwik-external.ts:132`).

## Cross-Cutting Concerns

**Logging:** No logging framework is used. Warnings and errors go through bundler hook context methods in `src/rolldown.ts`.
**Validation:** Input validation is hook-level and pattern-based: source file regexes in `src/rolldown.ts`, runtime bundle regexes in `src/build/manifest.ts`, HTML tag regexes in `src/build/static-html.ts`, and external ID checks in `src/qwik-external.ts`.
**Authentication:** Not applicable. This package is a bundler plugin and has no auth layer.
**Build artifacts:** Emit `q-manifest.json` and `build/bundle-graph.json` from `src/rolldown.ts`; generate their content through `src/build/manifest.ts`.
**Compatibility:** Preserve CSR, SSR/Nitro, and library fixture behavior under `fixtures/`; direct changes to shared hooks should be backed by tests in `test/`.

---

_Architecture analysis: 2026-05-09_
