# Qwik Bundler HMR Port

## What This Is

This project implements Qwik Hot Module Replacement support for `qwik-bundler` Vite serve mode by porting the working behavior from the local `HMR` branch and restructuring it for readability. The work is for maintainers of the standalone Qwik bundler rewrite who need Vite development behavior to match Qwik expectations without pulling Vite-server details into generic bundler code.

## Core Value

Vite serve mode supports Qwik HMR automatically, while `hmr: false` cleanly opts out and existing CSR, SSR/Nitro, and library behavior remains intact.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Port the working HMR behavior from branch `HMR` into the current codebase.
- [ ] Keep Vite HMR automatic in serve mode with `hmr: false` as a clean opt-out.
- [ ] Preserve existing CSR, SSR/Nitro, and library fixture behavior.
- [ ] Split HMR responsibilities across dev segment loading, Vite transport/hooks, and browser bridge runtime code.
- [ ] Keep `src/rolldown.ts` focused on bundler integration, optimizer transforms, manifest creation, and output hooks.
- [ ] Keep `src/vite.ts` focused on Vite adapter wiring and minimal orchestration.
- [ ] Avoid passing Vite server internals into generic dev segment code; use narrow callbacks for parent-module transforms.
- [ ] Compare against the local upstream Qwik Vite plugin before implementation and keep this rewrite simpler unless tests require more complexity.
- [ ] Add robust tests for bridge injection, virtual module resolution/loading, server hot-update forwarding, opt-out fallback/full reload behavior, and dev segment HMR accept code.
- [ ] Add or update practical fixture/browser smoke coverage for CSR Vite HMR and SSR/Nitro safety when feasible.
- [ ] Verify focused HMR tests, the full test suite, type/check commands, and CSR/Nitro fixture builds.

### Out of Scope

- Adding Qwik Router or app-framework conventions — router/app adapters own app entry defaults and app-specific wiring.
- Building a full raw Rolldown browser dev server — browser HMR is a Vite feature for this project.
- Manually injecting `@vite/client` — Vite owns it unless a real test proves it is missing.
- Coupling HMR to static CSR preloader behavior — static CSR preloader logic must remain isolated and unaffected.
- Rewriting upstream Qwik Vite plugin complexity wholesale — use it as a behavioral reference, not as an architectural target.

## Context

The current repository is an existing `qwik-bundler` codebase with CSR, SSR/Nitro, library, Vite, Rolldown, optimizer, manifest, static HTML, and fixture coverage. The local upstream Qwik Vite plugin lives at `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins` and must be compared before changing Vite, Rolldown, dev-server, HMR, manifest, optimizer, or static HTML behavior.

The working behavior exists on the local branch `HMR`, but the implementation should be reorganized before merging. Suggested separation is `src/dev.ts` or `src/dev/segments.ts` for dev QRL segment resolution/loading, `src/vite/hmr.ts` for the Vite HMR plugin and server-to-client forwarding, and `src/client/hmr-bridge.ts` for browser bridge runtime code.

Important behavior notes from the idea prompt: inject only the Qwik HMR bridge in Vite serve mode, dispatch Qwik's browser event, fall back to full reload when an update is not acknowledged, and forward relevant server-environment source updates to the client environment. SSR/SSG HTML must continue avoiding duplicate preloader injection via `q:render="ssr"` / `q:render="ssr-dev"`.

## Constraints

- **Architecture**: `src/rolldown.ts` remains focused on bundler integration, optimizer transforms, manifest creation, and output hooks.
- **Architecture**: `src/vite.ts` remains focused on Vite adapter wiring with minimal orchestration.
- **Separation**: HMR code is split into dev segment handling, Vite HMR transport/hooks, and browser bridge runtime code.
- **Dependency direction**: Generic dev segment code receives narrow callbacks instead of Vite server internals.
- **Runtime scope**: Raw Rolldown remains build/library/server tooling; full browser HMR belongs to Vite serve.
- **Verification**: Bug fixes and behavior changes need focused failing tests before implementation.
- **Compatibility**: Existing CSR, SSR/Nitro, and library fixture behavior must be preserved.
- **Simplicity**: Keep the rewrite easier to read than upstream Qwik Vite unless a fixture or test proves added complexity is necessary.

## Key Decisions

| Decision                                            | Rationale                                                                                          | Outcome   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| Use branch `HMR` as the behavior reference          | It contains working HMR behavior to port from                                                      | — Pending |
| Use upstream Qwik Vite plugin as a comparison point | It defines expected Qwik Vite behavior and edge cases                                              | — Pending |
| Keep browser HMR a Vite-only feature                | Vite owns `@vite/client` and browser dev transport                                                 | — Pending |
| Split implementation by responsibility              | Future readers should understand segment loading, Vite transport, and browser bridge independently | — Pending |
| Preserve static CSR preloader isolation             | HMR must not regress existing preloader/bootstrap behavior                                         | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-05-09 after initialization_
