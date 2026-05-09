# Coding Conventions

**Analysis Date:** 2026-05-09

## Naming Patterns

**Files:**

- Use lowercase kebab-case for multiword source modules: `src/build/static-html.ts`, `src/qwik-external.ts`.
- Use short domain names for top-level adapters: `src/rolldown.ts`, `src/vite.ts`, `src/dev.ts`, `src/features.ts`.
- Place build-specific helpers under `src/build/`: `src/build/chunking.ts`, `src/build/manifest.ts`, `src/build/static-html.ts`.
- Name tests by feature with `.test.ts` under `test/`: `test/rolldown-transform.test.ts`, `test/vite-config.test.ts`, `test/static-html.test.ts`.
- Name fixture source files after app entry roles: `fixtures/vite-csr/src/root.tsx`, `fixtures/vite-csr/src/main.tsx`, `fixtures/rolldown-hono/src/server.ts`.

**Functions:**

- Use camelCase for regular functions and helpers: `outputDefaults` in `src/build/chunking.ts`, `createManifest` in `src/build/manifest.ts`, `injectQwikPreloaderTags` in `src/build/static-html.ts`.
- Use `create*` for factories that return configured service/plugin objects: `createQwikDev` in `src/dev.ts`, `createOptimizer` usage in `src/rolldown.ts`, `createQwikExternal` in `src/qwik-external.ts`.
- Use direct verb names for transform or lookup helpers: `transform`, `reportDiagnostics`, `stripBuildPrefix`, `sourceImporter`, and `pathname` in `src/rolldown.ts`.
- Use `call*` for test hook invokers: `callTransform`, `callResolveId`, `callGenerateBundle`, and `callConfigResolved` in `test/helpers.ts`.

**Variables:**

- Use camelCase for local variables and mutable state: `currentEnvironment`, `missingManifestWarned`, `clientManifest`, and `currentRoot` in `src/rolldown.ts`.
- Use clear booleans with affirmative meaning: `handlers` and `missingManifestWarned` in `src/rolldown.ts`, `enabled` in `src/dev.ts`.
- Use descriptive collection names for maps/sets: `segments`, `symbols`, `manifests` in `src/rolldown.ts`, `parents` in `src/dev.ts`, `externals` in `src/qwik-external.ts`.
- Use `next` when creating a derived config object from input: `next` in `src/rolldown.ts` and `src/build/chunking.ts`.

**Types:**

- Use PascalCase for exported interfaces and type aliases: `QwikRolldownOptions` and `QwikEnvironment` in `src/rolldown.ts`, `QwikManifest` and `ServerQwikManifest` in `src/build/manifest.ts`.
- Prefix exported Qwik-specific types with `Qwik`: `QwikBundle`, `QwikAsset`, `QwikSymbol`, `QwikDevServer`.
- Keep internal helper types concise and local to the owning file: `EmitFile`, `TransformContext`, and `Environment` in `src/rolldown.ts`; `AssetPaths` in `src/build/static-html.ts`; `HookContext` in `test/helpers.ts`.
- Use `type` for unions, aliases, and lightweight object shapes; use `interface` for exported option/config contracts such as `QwikRolldownOptions` and `VitePluginOptions`.

## Code Style

**Formatting:**

- Formatting is configured through `vite-plus` in `vite.config.ts`.
- Use tabs with width 4: `fmt.useTabs: true`, `fmt.tabWidth: 4` in `vite.config.ts`.
- Use single quotes and LF endings: `fmt.singleQuote: true`, `fmt.endOfLine: 'lf'` in `vite.config.ts`.
- Keep lines around 100 columns: `fmt.printWidth: 100` in `vite.config.ts`.
- Prefer compact guard clauses for early exits: `if (item.type !== 'asset') continue;` in `src/build/static-html.ts`, `if (!enabled()) return null;` style in `src/dev.ts`.

**Linting:**

- Linting is run by `vite-plus` through `vp check` in `package.json` and configured in `vite.config.ts`.
- Ignore generated/runtime directories in lint and format checks: `dist/**` and `node_modules/**` in `vite.config.ts`.
- Pre-commit staged files use `vp check --fix` through `staged` config in `vite.config.ts`.
- TypeScript is strict: `strict: true`, `noUncheckedIndexedAccess: true`, and `verbatimModuleSyntax: true` in `tsconfig.json`.

## Import Organization

**Order:**

1. External runtime imports first, with value imports before local imports where practical: `@qwik.dev/optimizer`, `pathe`, `rolldown`, `ufo` in `src/rolldown.ts`.
2. Type-only imports use `import type` or inline `type` specifiers: `import type { Plugin, RolldownError } from 'rolldown'` in `src/rolldown.ts`, `import { createOptimizer, type Diagnostic }` in `src/rolldown.ts`.
3. Local relative imports follow external imports: `./build/chunking`, `./build/static-html`, `./dev`, `./features`, and `./build/manifest` in `src/rolldown.ts`.
4. Tests import Vitest APIs, source modules, then local helpers: `test/vite-plugin.test.ts`, `test/manifest.test.ts`, and `test/rolldown-runtime.test.ts`.

**Path Aliases:**

- No TypeScript path aliases are configured in `tsconfig.json`; use relative imports for local source and test helpers.
- Use package imports for public dependencies: `@qwik.dev/optimizer`, `pathe`, `ufo`, `rolldown`, `vite`, and `vitefu`.
- Use relative paths from tests to source: `../src/rolldown`, `../src/vite`, and `../src/build/manifest` in `test/*.test.ts`.

## Error Handling

**Patterns:**

- Convert plugin failures to Rollup/Rolldown-style errors with an `id`, `plugin`, and empty `stack`: `createPluginError` in `src/rolldown.ts`.
- Report optimizer diagnostics through the plugin context instead of throwing directly: `reportDiagnostics` calls `context.error` for `category === 'error'` and `context.warn` otherwise in `src/rolldown.ts`.
- Throw a normal `Error` only for invalid direct API/config usage: boolean `codeSplitting` throws in `src/build/chunking.ts`.
- Use nullable returns to express “not handled” in plugin hooks: `return null` in `resolveId`, `load`, and `transform` paths in `src/rolldown.ts`, `src/dev.ts`, and `src/qwik-external.ts`.
- In tests, throw explicit assertion guard errors only after runtime shape checks: `throw new Error('Expected transformed code')` in `test/manifest.test.ts` and `throw new Error('Expected crawlFrameworkPkgs options')` in `test/vite-config.test.ts`.

## Logging

**Framework:** console in fixtures only.

**Patterns:**

- Do not log from core library code in `src/`; use plugin warnings/errors through context APIs in `src/rolldown.ts`.
- Fixture servers may log listening URLs for manual/integration use: `fixtures/rolldown-hono/src/server.ts`, `fixtures/rolldown-h3/src/server.ts`, `fixtures/rolldown-library-consumer/src/server.ts`.
- Tests assert warning/error callbacks with `vi.fn()` instead of relying on console output: `test/rolldown-transform.test.ts`, `test/manifest.test.ts`.

## Comments

**When to Comment:**

- Use comments sparingly to explain non-obvious bundler constraints, not ordinary control flow: static CSR preloader rationale in `src/build/static-html.ts`.
- TODO comments are acceptable when tied to external upstream direction or known evolution: `src/rolldown.ts`, `src/vite.ts`, and `src/build/static-html.ts`.
- Prefer descriptive constant names over explanatory comments for regexes and magic module IDs: `QWIK_CORE_OR_HANDLERS_MODULE` in `src/build/chunking.ts`, `MODULE_SCRIPT_TAG` in `src/build/static-html.ts`.

**JSDoc/TSDoc:**

- Not used in current source files. Prefer exported interfaces and clear names over JSDoc unless documenting a public API edge case in `src/rolldown.ts` or `src/vite.ts`.

## Function Design

**Size:** Keep helpers small and purpose-specific. Examples: `cleanUrl`, `injectIntoHead`, and `modulepreload` in `src/build/static-html.ts`; `externalValueMatches`, `isQwikOutput`, and `isBareId` in `src/qwik-external.ts`.

**Parameters:** Pass explicit dependencies into helpers instead of reaching through broad globals. Examples: `createQwikDev(options, segments, root, encode)` in `src/dev.ts`, `createManifest(bundle, symbols, getRoot(), options)` in `src/rolldown.ts`.

**Return Values:** Use immutable/derived return objects for config helpers: `outputDefaults` in `src/build/chunking.ts`, `withQwikOutputDefaults` in `src/vite.ts`, `qwikViteExternal` in `src/qwik-external.ts`.

## Module Design

**Exports:**

- Export public adapter APIs from top-level modules: `qwik`, `qwikClient`, `qwikServer`, `qwikLib`, and `plugin` from `src/rolldown.ts`; `qwik` from `src/vite.ts`.
- Export build helpers only when used across modules or tests: `outputDefaults` from `src/build/chunking.ts`, `createManifest`, `injectManifest`, and constants from `src/build/manifest.ts`.
- Keep implementation helpers file-local unless reused: `scriptBundle` in `src/build/static-html.ts`, `entryStrategy` in `src/rolldown.ts`, `transformDevParent` in `src/dev.ts`.

**Barrel Files:**

- No source barrel files are used. Package exports map directly to built entry modules in `package.json`: `./rolldown` and `./vite`.
- Add new public entry points by adding a source module under `src/`, updating `vite.config.ts` pack entries, and updating `package.json` exports.

---

_Convention analysis: 2026-05-09_
