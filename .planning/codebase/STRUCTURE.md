# Codebase Structure

**Analysis Date:** 2026-05-09

## Directory Layout

```
qwik-bundler/
├── src/                         # Source for public Rolldown/Vite plugin entries and helper modules
│   ├── build/                   # Production artifact helpers: chunking, manifest, static HTML mutation
│   │   ├── chunking.ts          # Qwik output defaults and runtime code-splitting groups
│   │   ├── manifest.ts          # q-manifest and bundle graph creation/injection
│   │   └── static-html.ts       # Static CSR HTML preloader/modulepreload injection
│   ├── dev.ts                   # Vite serve/dev QRL segment support
│   ├── features.ts              # Qwik compile-time feature/global defines
│   ├── qwik-external.ts         # Rolldown/Vite Qwik external and noExternal handling
│   ├── rolldown.ts              # Core Qwik Rolldown plugin and public Rolldown exports
│   └── vite.ts                  # Vite adapter around the Rolldown plugin
├── test/                        # Vitest unit tests for hooks, helpers, and output behavior
│   ├── helpers.ts               # Direct hook invocation helpers used across tests
│   └── *.test.ts                # Focused tests for each source module/integration surface
├── fixtures/                    # Real host-native QA fixtures for Vite, Rolldown, Nitro, and libraries
│   ├── vite-csr/                # Vite client-side rendering fixture
│   ├── vite-qwik-router/        # Vite + Qwik Router fixture with app-owned entries
│   ├── vite-nitro-v3/           # Vite + Nitro SSR fixture
│   ├── vite-library/            # Vite library fixture
│   ├── vite-plus/               # Vite Plus fixture
│   ├── rolldown-hono/           # Rolldown server fixture using Hono
│   ├── rolldown-h3/             # Rolldown server fixture using H3
│   ├── rolldown-library/        # Rolldown Qwik library fixture
│   ├── rolldown-library-consumer/ # Consumer fixture for Qwik library output
│   └── tsdown-library/          # tsdown library fixture
├── .planning/                   # GSD planning and generated codebase maps
│   └── codebase/                # Architecture/structure/stack/quality documents
├── .opencode/                   # Local OpenCode metadata/configuration
├── .vite-hooks/                 # Local Vite hook support directory
├── package.json                 # Package exports, scripts, deps, peer deps, Node/pnpm requirements
├── pnpm-lock.yaml               # pnpm dependency lockfile
├── pnpm-workspace.yaml          # workspace definition
├── tsconfig.json                # strict TypeScript config for source and package config
├── vite.config.ts               # vite-plus pack/test/lint/format configuration
├── README.md                    # project overview and integration notes
└── AGENTS.md                    # repository-specific contributor rules and architecture constraints
```

## Directory Purposes

**`src/`:**

- Purpose: implementation source for the Qwik bundler package.
- Contains: public plugin exports, bundler hook orchestration, build artifact helpers, Vite adapter wiring, dev-mode segment resolution, and external dependency handling.
- Key files: `src/rolldown.ts`, `src/vite.ts`, `src/dev.ts`, `src/features.ts`, `src/qwik-external.ts`.

**`src/build/`:**

- Purpose: production build helpers that are not specific to the public adapter surface.
- Contains: output defaults, Qwik runtime chunk grouping, manifest creation, bundle graph conversion, manifest injection, and static CSR preloader injection.
- Key files: `src/build/chunking.ts`, `src/build/manifest.ts`, `src/build/static-html.ts`.

**`test/`:**

- Purpose: unit-level verification of plugin hooks and build helpers.
- Contains: Vitest tests and shared hook-call helpers.
- Key files: `test/helpers.ts`, `test/rolldown-transform.test.ts`, `test/vite-plugin.test.ts`, `test/manifest.test.ts`, `test/static-html.test.ts`, `test/qwik-external.test.ts`, `test/chunking.test.ts`, `test/vite-config.test.ts`, `test/rolldown-runtime.test.ts`.

**`fixtures/`:**

- Purpose: real app/package smoke targets for host-native plugin integration.
- Contains: fixture-specific `package.json`, TypeScript configs, Vite/Rolldown/tsdown configs, source apps, and generated build outputs under individual fixture directories.
- Key files: `fixtures/README.md`, `fixtures/vite-csr/vite.config.ts`, `fixtures/vite-qwik-router/vite.config.ts`, `fixtures/vite-nitro-v3/vite.config.ts`, `fixtures/rolldown-hono/rolldown.config.ts`, `fixtures/rolldown-h3/rolldown.config.ts`, `fixtures/rolldown-library/rolldown.config.ts`, `fixtures/tsdown-library/tsdown.config.ts`.

**`.planning/codebase/`:**

- Purpose: generated GSD codebase maps consumed by planning/execution workflows.
- Contains: documents such as `.planning/codebase/ARCHITECTURE.md` and `.planning/codebase/STRUCTURE.md`.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

**Package/config root:**

- Purpose: package metadata, workspace configuration, TypeScript settings, and build/test configuration.
- Contains: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `vite.config.ts`, `README.md`, `AGENTS.md`.
- Key files: `package.json`, `vite.config.ts`, `tsconfig.json`.

## Key File Locations

**Entry Points:**

- `src/rolldown.ts`: public Rolldown plugin entry with `qwik()`, `qwikClient()`, `qwikServer()`, `qwikLib()`, and the generic `plugin()` factory.
- `src/vite.ts`: public Vite plugin entry with Vite config/dev-server wiring around `src/rolldown.ts`.
- `package.json`: maps `./rolldown` to `./dist/rolldown.mjs` and `./vite` to `./dist/vite.mjs`.

**Configuration:**

- `package.json`: package scripts, dependencies, peer dependencies, Node engine, pnpm version, and export map.
- `tsconfig.json`: strict ESNext TypeScript config with `moduleResolution: "bundler"`, `noUncheckedIndexedAccess`, and `verbatimModuleSyntax`.
- `vite.config.ts`: vite-plus `pack`, `test`, `lint`, and `fmt` settings; package build entries are `./src/rolldown.ts` and `./src/vite.ts`.
- `pnpm-workspace.yaml`: pnpm workspace configuration.

**Core Logic:**

- `src/rolldown.ts`: optimizer transform boundary, segment storage/loading, manifest handoff, output hooks, and environment-specific behavior.
- `src/dev.ts`: development QRL resolution and parent transformation callbacks.
- `src/qwik-external.ts`: Qwik package crawling/noExternal behavior and Rolldown external wrapping.
- `src/features.ts`: Qwik experimental feature define and replacement logic.

**Build Helpers:**

- `src/build/chunking.ts`: Qwik runtime output file names, chunk groups, and code-splitting validation.
- `src/build/manifest.ts`: `QwikManifest` types, symbol mapping, runtime bundle detection, bundle graph conversion, and manifest injection.
- `src/build/static-html.ts`: CSR-only HTML preload injection after manifest creation.

**Testing:**

- `test/helpers.ts`: test-only hook invocation utilities.
- `test/rolldown-transform.test.ts`: optimizer transform, diagnostics, source filtering, and environment mode tests.
- `test/vite-plugin.test.ts`: Vite adapter identity, root/dev context, environment inference, and segment module behavior tests.
- `test/manifest.test.ts`: manifest and bundle graph behavior tests.
- `test/static-html.test.ts`: static CSR preloader injection tests.
- `test/qwik-external.test.ts`: external/noExternal behavior tests.
- `test/chunking.test.ts`: output default and chunking tests.
- `test/vite-config.test.ts`: Vite config default tests.
- `test/rolldown-runtime.test.ts`: runtime build behavior tests.

**Fixtures:**

- `fixtures/README.md`: fixture contract and run instructions.
- `fixtures/vite-csr/src/main.tsx`: Vite CSR app entry.
- `fixtures/vite-csr/src/root.tsx`: Vite CSR root component.
- `fixtures/vite-qwik-router/src/entry.ssr.tsx`: router-owned SSR entry.
- `fixtures/vite-qwik-router/src/entry.preview.tsx`: router-owned preview entry.
- `fixtures/vite-qwik-router/src/routes/index.tsx`: router fixture route.
- `fixtures/vite-nitro-v3/src/entry-server.tsx`: Nitro SSR server entry.
- `fixtures/rolldown-hono/src/server.ts`: Hono server fixture entry.
- `fixtures/rolldown-h3/src/server.ts`: H3 server fixture entry.
- `fixtures/rolldown-library/src/index.tsx`: Qwik library fixture entry.
- `fixtures/tsdown-library/src/index.tsx`: tsdown library fixture entry.

## Naming Conventions

**Files:**

- Use kebab-case for multi-word implementation and test modules: `src/qwik-external.ts`, `src/build/static-html.ts`, `test/qwik-external.test.ts`, `test/static-html.test.ts`.
- Use single-purpose nouns for compact helper modules: `src/dev.ts`, `src/features.ts`, `src/build/chunking.ts`, `src/build/manifest.ts`.
- Use adapter names for public entry files: `src/rolldown.ts` and `src/vite.ts`.
- Use `.test.ts` suffix for Vitest tests in `test/`.
- Use framework/tool names for fixture directories: `fixtures/vite-csr/`, `fixtures/vite-nitro-v3/`, `fixtures/rolldown-hono/`, `fixtures/tsdown-library/`.

**Directories:**

- Put production helper subdomains under `src/build/` when they operate on build output artifacts.
- Put tests under root `test/`, not co-located beside `src/` modules.
- Put integration/smoke apps under `fixtures/<tool-or-framework>-<mode>/`.
- Keep generated package output under `dist/` and fixture-generated outputs inside each fixture directory, not under `src/`.

**Exports:**

- Public package entry files should correspond to export map keys in `package.json`: `src/rolldown.ts` for `./rolldown` and `src/vite.ts` for `./vite`.
- Internal helpers should use named exports where consumed across modules, such as `outputDefaults` from `src/build/chunking.ts` and `createManifest` from `src/build/manifest.ts`.

## Where to Add New Code

**New Rolldown Hook Behavior:**

- Primary code: `src/rolldown.ts`
- Supporting helper: create or extend a focused module only when the behavior is reusable or separately testable, such as `src/build/manifest.ts` for manifest changes or `src/dev.ts` for dev QRL behavior.
- Tests: add focused coverage in `test/rolldown-transform.test.ts`, `test/rolldown-runtime.test.ts`, or a new `test/<feature>.test.ts` when no existing suite owns the behavior.

**New Vite Adapter Behavior:**

- Primary code: `src/vite.ts`
- External/noExternal support: `src/qwik-external.ts`
- Tests: `test/vite-plugin.test.ts` for hook/runtime behavior and `test/vite-config.test.ts` for config defaults.

**New Manifest or Bundle Graph Behavior:**

- Primary code: `src/build/manifest.ts`
- Hook integration: `src/rolldown.ts` only when emitting/consuming artifacts changes.
- Tests: `test/manifest.test.ts`.

**New Output Chunking or Runtime Grouping:**

- Primary code: `src/build/chunking.ts`
- Hook integration: `src/rolldown.ts` and `src/vite.ts` through `outputDefaults()`.
- Tests: `test/chunking.test.ts` and fixture builds under `fixtures/` when runtime behavior changes.

**New Static HTML Build Behavior:**

- Primary code: `src/build/static-html.ts`
- Hook integration: call from the client `generateBundle` path in `src/rolldown.ts` after the manifest exists.
- Tests: `test/static-html.test.ts`.

**New Dev/HMR Segment Behavior:**

- Primary code: `src/dev.ts`
- Hook integration: `resolveId`, `load`, or `transform` in `src/rolldown.ts`; Vite server handoff in `src/vite.ts` only when needed.
- Tests: `test/vite-plugin.test.ts` for Vite serve behavior and `test/rolldown-transform.test.ts` for optimizer input mode changes.

**New Experimental Feature Flags:**

- Primary code: `src/features.ts`
- Hook integration: `defineQwik()` and `replaceExperimental()` calls in `src/rolldown.ts` already provide the extension point.
- Tests: `test/rolldown-transform.test.ts`.

**New Externalization Behavior:**

- Primary code: `src/qwik-external.ts`
- Rolldown integration: `src/rolldown.ts`
- Vite integration: `src/vite.ts`
- Tests: `test/qwik-external.test.ts` and `test/vite-config.test.ts`.

**New Fixture:**

- Directory: `fixtures/<tool-or-framework>-<mode>/`
- Required files: fixture-specific `package.json`, config file such as `vite.config.ts` or `rolldown.config.ts`, `tsconfig.json` when TypeScript is used, and app/library source under `src/`.
- Follow fixture contract in `fixtures/README.md`: host config owns entries, output, server adapters, router plugins, and library mode; the Qwik plugin is used only as `qwik()` from `qwik-bundler/rolldown` or `qwik-bundler/vite`.

**Utilities:**

- Shared build-output utilities: `src/build/`.
- Shared plugin/dev utilities: prefer a focused root `src/<domain>.ts` file only when used by multiple modules.
- Test utilities: `test/helpers.ts`.

## Special Directories

**`dist/`:**

- Purpose: package build output generated from `src/rolldown.ts` and `src/vite.ts`.
- Generated: Yes
- Committed: Not detected from `.gitignore` contents in this mapping; package `files` includes `dist` in `package.json`.

**`node_modules/`:**

- Purpose: installed workspace dependencies.
- Generated: Yes
- Committed: No

**`fixtures/*/node_modules/`:**

- Purpose: fixture-local installed dependencies and generated Vite dependency caches.
- Generated: Yes
- Committed: No

**`fixtures/*/server/`, `fixtures/*/dist/`, `fixtures/*/.output/`, and fixture build folders:**

- Purpose: generated fixture outputs used for local smoke validation.
- Generated: Yes
- Committed: fixture-dependent; treat as generated output and avoid using it as source of architectural truth unless validating output behavior.

**`.planning/codebase/`:**

- Purpose: generated GSD architecture, structure, stack, quality, and concern maps.
- Generated: Yes
- Committed: Intended planning artifact directory.

**`.opencode/`:**

- Purpose: local OpenCode metadata/configuration.
- Generated: Yes
- Committed: Not applicable for implementation source.

**`.vite-hooks/`:**

- Purpose: local Vite hook support directory.
- Generated: Not detected
- Committed: Not applicable for implementation source.

---

_Structure analysis: 2026-05-09_
