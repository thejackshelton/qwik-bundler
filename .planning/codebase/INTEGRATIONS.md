# External Integrations

**Analysis Date:** 2026-05-09

## APIs & External Services

**Bundler hosts:**

- Rolldown - primary bundler host for client/server/lib Qwik builds.
    - SDK/Client: `rolldown` plugin API imported in `src/rolldown.ts`, `src/build/chunking.ts`, `src/build/manifest.ts`, and `src/qwik-external.ts`.
    - Auth: Not applicable.
- Vite - adapter host and dev server integration.
    - SDK/Client: `vite` plugin/config types in `src/vite.ts`; dynamic `searchForWorkspaceRoot` import in `src/qwik-external.ts`.
    - Auth: Not applicable.
- vite-plus - repository task runner and fixture host.
    - SDK/Client: `defineConfig` in `vite.config.ts` and `fixtures/vite-plus/vite.config.ts`.
    - Auth: Not applicable.
- tsdown - library fixture host using the Rolldown adapter.
    - SDK/Client: `defineConfig` in `fixtures/tsdown-library/tsdown.config.ts`.
    - Auth: Not applicable.

**Qwik ecosystem:**

- Qwik optimizer - local transform service for extracting Qwik segments and diagnostics.
    - SDK/Client: `@qwik.dev/optimizer` `createOptimizer()` and `transformModules()` in `src/rolldown.ts`.
    - Auth: Not applicable.
- Qwik core runtime - fixture runtime, SSR renderer, handlers, loader, preloader, and manifest targets.
    - SDK/Client: `@qwik.dev/core`, `@qwik.dev/core/server`, `@qwik.dev/core/handlers.mjs`, and `@qwik.dev/core/preloader` referenced in `src/rolldown.ts`, `src/dev.ts`, `src/build/manifest.ts`, and `fixtures/*/src/**/*.ts*`.
    - Auth: Not applicable.
- Qwik Router - fixture-only router/app integration.
    - SDK/Client: `@qwik.dev/router/vite` in `fixtures/vite-qwik-router/vite.config.ts`.
    - Auth: Not applicable.

**Server adapters used by fixtures:**

- Hono - Node SSR fixture server.
    - SDK/Client: `hono`, `@hono/node-server`, and `@hono/node-server/serve-static` in `fixtures/rolldown-hono/src/server.ts` and `fixtures/rolldown-library-consumer/src/server.ts`.
    - Auth: Not applicable.
- h3 - Node SSR fixture server.
    - SDK/Client: `h3` and `h3/node` in `fixtures/rolldown-h3/src/server.ts`.
    - Auth: Not applicable.
- Nitro - Vite SSR/meta-framework fixture.
    - SDK/Client: `nitro/vite` in `fixtures/vite-nitro-v3/vite.config.ts`.
    - Auth: Not applicable.

**Package registry preview:**

- pkg.pr.new - fixture dependency source for Qwik prerelease builds.
    - SDK/Client: URL dependencies in `fixtures/*/package.json` for `@qwik.dev/core` and `@qwik.dev/router`.
    - Auth: Not detected.

## Data Storage

**Databases:**

- Not detected.
    - Connection: Not applicable.
    - Client: Not applicable.

**File Storage:**

- Local filesystem only.
    - Build artifacts are emitted by Rolldown/Vite into `dist/`, `server/`, `lib/`, and `.output/` fixture directories.
    - Static fixture assets are read from local output in `fixtures/rolldown-h3/src/server.ts` with `readFile()` and `stat()`.
    - Hono fixtures serve local files from `./dist` in `fixtures/rolldown-hono/src/server.ts` and `fixtures/rolldown-library-consumer/src/server.ts`.

**Caching:**

- In-memory plugin state only.
    - `src/rolldown.ts` stores per-root client manifests in the module-level `manifests` `Map`.
    - `src/dev.ts` stores development segment parent mappings in `Map` instances scoped to `createQwikDev()`.
    - No Redis, Memcached, CDN API, or persistent cache integration detected.

## Authentication & Identity

**Auth Provider:**

- Not detected.
    - Implementation: No OAuth, session, JWT, cookie auth, or identity SDK usage detected in `src/`, `test/`, or `fixtures/` TypeScript files.

## Monitoring & Observability

**Error Tracking:**

- None detected.

**Logs:**

- Build diagnostics use bundler warnings/errors from `reportDiagnostics()` and `createPluginError()` in `src/rolldown.ts`.
- Fixture server startup messages use `console.log()` in `fixtures/rolldown-h3/src/server.ts`, `fixtures/rolldown-hono/src/server.ts`, and `fixtures/rolldown-library-consumer/src/server.ts`.
- No structured logger, metrics SDK, tracing SDK, or remote observability service detected.

## CI/CD & Deployment

**Hosting:**

- Not configured for the package itself.
- Fixtures demonstrate local Node hosting with Hono/h3 and Nitro output in `fixtures/rolldown-hono/src/server.ts`, `fixtures/rolldown-h3/src/server.ts`, and `fixtures/vite-nitro-v3/package.json`.

**CI Pipeline:**

- None detected; no `.github/workflows/*` files found.

## Environment Configuration

**Required env vars:**

- `PORT` - optional fixture server port override in `fixtures/rolldown-h3/src/server.ts`, `fixtures/rolldown-hono/src/server.ts`, and `fixtures/rolldown-library-consumer/src/server.ts`; defaults to `4173`.
- No required API keys, database URLs, auth secrets, or webhook secrets detected.

**Secrets location:**

- No `.env` files detected in the repository root.
- No credential/secret files were read or required for the detected integrations.
- If consumers add secrets, keep them outside committed fixture and package source files.

## Webhooks & Callbacks

**Incoming:**

- None detected.
- Fixture HTTP routes are local app routes only: `/` and `/build/**` in `fixtures/rolldown-h3/src/server.ts`, `/` and static asset middleware in `fixtures/rolldown-hono/src/server.ts`.

**Outgoing:**

- Browser runtime fetch for Qwik bundle graph only.
    - `src/build/static-html.ts` injects inline module code that calls `fetch(bundle-graph.json)` for static CSR preloader setup.
- No outgoing SaaS APIs, webhooks, payment processors, email providers, or cloud SDK calls detected.

---

_Integration audit: 2026-05-09_
