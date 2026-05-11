---
slug: nitro-hmr-regression
status: in-progress
created: 2026-05-10
---

# Nitro Vite HMR Regression

Add a failing browser smoke test that covers `fixtures/vite-nitro-v3` Vite dev HMR, specifically removing and re-adding visible content in `src/home.tsx`, then implement the smallest fix so the test passes.

## Scope

- Add a Nitro-specific browser HMR smoke command or reusable smoke harness support.
- Confirm the new test fails before the fix.
- Compare relevant behavior against `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins` before source behavior changes.
- Keep raw Rolldown dev/HMR unsupported.
- Verify focused HMR/browser commands after the fix.
