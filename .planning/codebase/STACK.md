# Technology Stack

**Analysis Date:** 2026-05-09

## Languages

**Primary:**

- TypeScript 5.9.3 - implementation, tests, and fixtures in `src/**/*.ts`, `test/**/*.ts`, and `fixtures/**/*.ts*`; compiler options live in `tsconfig.json`.
- TSX / JSX via TypeScript - Qwik component fixtures in `fixtures/*/src/**/*.tsx`; optimizer transform enables `transpileTs` and `transpileJsx` in `src/rolldown.ts`.

**Secondary:**

- JavaScript ESM output - package exports `./dist/rolldown.mjs` and `./dist/vite.mjs` from `package.json`; emitted bundles use ESM format in `vite.config.ts`.
- YAML - workspace and lockfile metadata in `pnpm-workspace.yaml` and `pnpm-lock.yaml`.
- Markdown - project and fixture instructions in `README.md`, `fixtures/README.md`, and `AGENTS.md`.

## Runtime

**Environment:**

- Node.js >=22 - required by `package.json` `engines.node`; fixture servers use Node APIs such as `node:http` and `node:fs/promises` in `fixtures/rolldown-h3/src/server.ts`.
- Browser ESM - client builds emit Qwik runtime chunks and static HTML preload tags from `src/rolldown.ts`, `src/build/chunking.ts`, and `src/build/static-html.ts`.

**Package Manager:**

- pnpm 10.33.2 - declared by `package.json` `packageManager`.
- Lockfile: present at `pnpm-lock.yaml` with lockfile version `9.0`.
- Workspace: `pnpm-workspace.yaml` includes `.` and `fixtures/*`.

## Frameworks

**Core:**

- `@qwik.dev/optimizer` 2.1.0-beta.2 - primary optimizer boundary; `src/rolldown.ts` lazily creates `createOptimizer()` and calls `transformModules()`.
- Rolldown 1.0.0-rc.18 - bundler plugin API and peer dependency; `src/rolldown.ts` exports `qwik`, `qwikClient`, `qwikServer`, and `qwikLib`.
- Vite 8.0.10 - adapter and peer dependency; `src/vite.ts` wraps the Rolldown plugin as `vite-plugin-qwik`.
- Qwik core from pkg.pr.new - fixture runtime dependency; fixtures pin `@qwik.dev/core` to `https://pkg.pr.new/QwikDev/qwik/@qwik.dev/core@1f3647c` in `fixtures/*/package.json`.

**Testing:**

- Vitest 4.1.5 resolved / `^4.0.18` declared - test runner configured by `vite.config.ts` with `environment: 'node'` and `include: ['test/**/*.test.ts']`.
- Fixture-backed smoke tests - test files under `test/*.test.ts` exercise `fixtures/rolldown-*`, `fixtures/vite-*`, and `fixtures/tsdown-library`.

**Build/Dev:**

- vite-plus 0.1.20 - repo task runner/config wrapper; scripts in `package.json` call `vp pack`, `vp test`, `vp check`, and `vp config`.
- TypeScript 5.9.3 - strict type checking via `tsconfig.json` with `strict`, `noUncheckedIndexedAccess`, and `moduleResolution: 'bundler'`.
- tsdown 0.21.10 - fixture library host in `fixtures/tsdown-library/package.json` and `fixtures/tsdown-library/tsdown.config.ts`.

## Key Dependencies

**Critical:**

- `@qwik.dev/optimizer` 2.1.0-beta.2 - required for Qwik segment extraction, diagnostics, entry strategies, and transforms in `src/rolldown.ts`.
- `rolldown` 1.0.0-rc.18 - provides plugin hooks, output bundle types, code splitting options, and build execution in `src/rolldown.ts`, `src/build/chunking.ts`, and fixture `rolldown.config.ts` files.
- `vite` 8.0.10 - provides Vite plugin hooks, dev server integration, workspace root detection, and fixture builds in `src/vite.ts` and `src/qwik-external.ts`.
- `@qwik.dev/core` pkg.pr.new build - runtime dependency for fixtures, SSR rendering, Qwik loader/preloader/core chunks, and manifest detection in `fixtures/*/package.json` and `src/build/manifest.ts`.

**Infrastructure:**

- `pathe` 2.0.3 - filesystem-style path resolution and normalization in `src/rolldown.ts`, `src/dev.ts`, `src/build/manifest.ts`, and `src/qwik-external.ts`; prefer this over hand-rolled path logic.
- `ufo` 1.6.4 - URL and module id path handling in `src/rolldown.ts`, `src/dev.ts`, and `src/build/static-html.ts`; prefer this for URL joins/parsing.
- `vitefu` 1.1.3 - framework package crawling for Vite dependency optimization and `noExternal` defaults in `src/qwik-external.ts`.
- `@types/node` 24.12.2 resolved / `^24.10.1` declared - Node type support for implementation tests and fixtures.

## Configuration

**Environment:**

- No `.env` files detected in the repository root.
- Node engine is configured in `package.json` as `>=22`.
- Fixture HTTP ports read `PORT` with fallback `4173` in `fixtures/rolldown-h3/src/server.ts`, `fixtures/rolldown-hono/src/server.ts`, and `fixtures/rolldown-library-consumer/src/server.ts`.
- Vite serve mode enables dev behavior through `configResolved()` in `src/vite.ts`; HMR/dev segment loading uses the narrow `QwikDevServer` interface in `src/dev.ts`.

**Build:**

- `vite.config.ts` defines package entry points `./src/rolldown.ts` and `./src/vite.ts`, ESM format, DTS output, test matching, lint ignores, and formatting rules.
- `tsconfig.json` targets `ESNext`, uses `moduleResolution: 'bundler'`, includes `src` and `vite.config.ts`, and emits no files during type checking.
- `package.json` exports only `./rolldown`, `./vite`, and `./package.json`; new public APIs must be routed through these entry points.
- Rolldown fixtures configure host-owned client/server/library builds in `fixtures/rolldown-h3/rolldown.config.ts`, `fixtures/rolldown-hono/rolldown.config.ts`, and `fixtures/rolldown-library/rolldown.config.ts`.
- Vite fixtures configure host-owned plugin stacks in `fixtures/vite-csr/vite.config.ts`, `fixtures/vite-nitro-v3/vite.config.ts`, `fixtures/vite-qwik-router/vite.config.ts`, and `fixtures/vite-library/vite.config.ts`.

## Platform Requirements

**Development:**

- Use Node.js 22 or newer and pnpm 10.33.2 as specified in `package.json`.
- Run `pnpm build` before fixture builds so workspace fixtures resolve `qwik-bundler` output, as documented in `README.md` and `fixtures/README.md`.
- Use `pnpm test` for all tests, `pnpm test:watch` for watch mode, and `pnpm check` for type/lint/format checks from `package.json`.
- Keep framework entry defaults inside fixture/app host configs; core bundler entry points remain `src/rolldown.ts` and `src/vite.ts` per `AGENTS.md`.

**Production:**

- Package output is ESM-only under `dist/` with public exports declared in `package.json`.
- Client builds emit `build/q-[hash].js`, `build/bundle-graph.json`, and `q-manifest.json` from `src/rolldown.ts` and `src/build/chunking.ts`.
- Server/library host targets are owned by consumers; fixtures demonstrate Node server output in `fixtures/rolldown-h3/server`, `fixtures/rolldown-hono/server`, and Nitro output `.output/server/index.mjs` from `fixtures/vite-nitro-v3/package.json`.

---

_Stack analysis: 2026-05-09_
