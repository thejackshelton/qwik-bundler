---
slug: nitro-hmr-regression
status: complete
completed: 2026-05-10
---

# Nitro HMR Regression Summary

## Result

Added a Nitro-specific Vite dev browser smoke test and fixed the Vite plugin so SSR HTML responses that bypass `transformIndexHtml` still receive the Qwik HMR bridge during development.

## What Changed

- Added `scripts/smoke-vite-nitro-hmr.mjs`.
- Added `pnpm test:hmr-nitro`.
- Updated `src/vite/hmr.ts` to inject the Qwik HMR bridge through a buffered Vite dev HTML middleware, avoiding header/content-length races in Nitro responses.
- Removed the temporary fixture-owned bridge injection from `fixtures/vite-nitro-v3/src/entry-server.tsx`.

## Failing Test Evidence

- `pnpm test:hmr-nitro` failed before the plugin fix with `page.waitForFunction: Timeout 15000ms exceeded` because the Nitro SSR response did not include the Qwik HMR bridge.

## Verification

- `pnpm test:hmr-nitro` passed and observed one `qHmr` event while adding a button in the browser.
- `pnpm test:hmr-browser` passed, preserving CSR HMR behavior.
- `pnpm exec tsc --noEmit --project tsconfig.json` passed.
- `pnpm --filter @fixtures/vite-csr build` passed, proving the dev-only injection does not leak into CSR production build.
- `pnpm --filter @fixtures/vite-nitro-v3 build` is currently blocked by the fixture config omitting the client build environment/input; Nitro builds SSR then fails writing its assets manifest with `Cannot convert undefined or null to object`.
- Full `pnpm check` is blocked only by existing manual formatting changes in `fixtures/vite-csr/src/home.tsx` and `fixtures/vite-nitro-v3/src/home.tsx`.

## Notes

- Raw `fixtures/rolldown-h3` remains unsupported for browser HMR by design; this fix covers the Vite Nitro fixture.
