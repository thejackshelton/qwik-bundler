# Phase 4: Browser Smoke and Final Verification - Research

**Researched:** 2026-05-10
**Status:** Ready for planning

## Scope

Phase 4 covers the remaining milestone requirements:

- `TEST-07`: Fixture or browser smoke coverage verifies CSR Vite HMR updates a component in the browser when practical.
- `TEST-09`: Final verification runs focused HMR tests, `pnpm test`, `pnpm check`, `pnpm --filter @fixtures/vite-csr build`, and `pnpm --filter @fixtures/vite-nitro-v3 build`.

## Existing Verified Baseline

- Phase 1 verified dev QRL segment resolution, self-accept code, environment isolation, invalidation, and parent-transform callback behavior.
- Phase 2 verified Vite bridge injection, virtual bridge loading, client/SSR custom HMR forwarding, and `hmr: false` full-reload fallback.
- Phase 3 verified HMR does not leak into production, SSR/Nitro, static HTML, raw Rolldown, or library outputs. It also added `pnpm test:hmr-leakage` for fixture build leakage scanning.

## Upstream Comparison Points

Relevant upstream files under `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins`:

- `vite.ts`: defines a client bridge that listens for `qwik:hmr`, dispatches browser `qHmr`, and reloads after a 500ms fallback when Qwik does not acknowledge.
- `vite.ts`: forwards SSR source hot updates through `viteServer.environments.client.hot.send({ type: 'custom', event: 'qwik:hmr', data: { files, t } })`; disabled HMR sends `{ type: 'full-reload' }`.
- `plugin.ts`: appends `import.meta.hot.accept` code to non-worker generated QRL segments in dev HMR mode and dispatches `qHmr` for parent files.
- `plugin.ts`: invalidates generated segment modules derived from changed parent modules during dev hot update.

The local implementation intentionally keeps these behaviors split across simpler files:

- `src/vite/hmr.ts`: Vite-only bridge injection, custom event transport, SSR client-channel forwarding, and full-reload fallback.
- `src/client/hmr-bridge.ts`: browser bridge runtime.
- `src/dev.ts`: generated dev segment loading, self-accept append, and invalidation.
- `src/rolldown.ts`: optimizer mode selection and generic plugin hooks.

Before changing source behavior in Phase 4, compare the failing behavior against the upstream files above and keep the fix smaller than upstream unless the smoke test proves extra complexity is required.

## Practical Browser Smoke Approach

The repo has no existing Playwright, Cypress, or browser E2E runner. The minimal practical smoke coverage is a repo-local Node script that:

- Builds the package first so the workspace fixture resolves current `qwik-bundler` output.
- Starts the Vite dev server programmatically for `fixtures/vite-csr` using its existing `vite.config.ts` and host-owned entries.
- Opens the fixture in a headless Chromium browser through Playwright.
- Instruments the page to count browser `qHmr` events and post-initial navigations.
- Edits `fixtures/vite-csr/src/home.tsx` to replace `Vite Direct Fixture` with a unique smoke marker.
- Waits until the browser DOM `<h1>` contains that marker.
- Fails if no `qHmr` event was seen or if the page navigated/reloaded after the initial load.
- Restores `home.tsx` in a `finally` block and closes browser/server resources.

This keeps app/router defaults out of the bundler and exercises the actual CSR fixture in Vite serve mode.

## Verification Strategy

Use two verification layers:

- Focused HMR/browser verification: `pnpm test test/vite-hmr.test.ts test/rolldown-runtime.test.ts && pnpm test:hmr-browser`.
- Final milestone verification: focused HMR tests, `pnpm test`, `pnpm check`, `pnpm --filter @fixtures/vite-csr build`, and `pnpm --filter @fixtures/vite-nitro-v3 build`.

If `pnpm check` still reports the pre-existing `AGENTS.md` formatting issue noted in Phase 1 state, Phase 4 execution must resolve it or otherwise make `pnpm check` pass because `TEST-09` explicitly requires a successful check command.

## Planning Notes

- Do not add Qwik Router or app-framework entry defaults to the core bundler.
- Do not add raw Rolldown browser dev server HMR.
- Do not move preview middleware or app-specific output wiring into the core plugin.
- Keep static CSR preloader logic isolated in `src/build/static-html.ts`.
- Prefer minimal test/script additions over changing source behavior. Source behavior changes are only allowed after the browser smoke or final command suite proves a real failure.
