# Pitfalls Research

**Domain:** Qwik/Vite HMR implementation for `qwik-bundler` rewrite  
**Researched:** 2026-05-09  
**Confidence:** HIGH for Vite HMR mechanics and local upstream behavior; MEDIUM for Qwik runtime internals not exposed in public docs

## Critical Pitfalls

### Pitfall 1: Treating Qwik HMR like ordinary module self-acceptance

**What goes wrong:**
QRL segment modules update in Vite, but mounted/resumed Qwik components do not re-render. The browser console shows Vite updates, yet the visible DOM stays stale until a full reload or user interaction.

**Why it happens:**
Qwik's optimizer extracts `$` closures into lazy QRL segments. Public Qwik docs describe QRLs as serialized URLs that point to lazy-loaded chunks and symbols, not as normal eagerly imported component modules. Vite's HMR API only considers modules with a statically analyzable `import.meta.hot.accept(` call to be HMR boundaries. Upstream Qwik addresses this with two pieces: segment-level accept code and a browser bridge that converts a custom `qwik:hmr` event into Qwik's `qHmr` document event.

**How to avoid:**

- Keep Qwik-specific HMR as a three-part system: dev segment resolution/loading, Vite server/custom event forwarding, and a client bridge that dispatches `document.dispatchEvent(new CustomEvent('qHmr', ...))`.
- Append literal `import.meta.hot.accept(` code to served dev QRL segments when HMR is enabled; do not hide the accept call behind helper wrappers because Vite statically scans for the exact syntax.
- Dispatch `qHmr` with file URLs that match the optimizer's dev paths, not filesystem paths with platform-specific separators.
- Add tests that prove an updated segment contains the static accept call and dispatches `qHmr`.

**Warning signs:**

- Tests only assert Vite WebSocket messages, not Qwik re-render behavior.
- Updated modules are accepted by Vite but no `qHmr` event is observable in the browser.
- Segment code imports an HMR helper instead of containing the literal `import.meta.hot.accept(` text.
- Dev behavior works for directly imported modules but not for `$()` handlers or paused/resumed components.

**Phase to address:**
Phase 1: dev segment HMR accept code and browser bridge foundation.

---

### Pitfall 2: Sending HMR events from the wrong Vite environment

**What goes wrong:**
SSR/Nitro dev changes trigger server-side module invalidation but never reach the browser, or client-only changes are sent to the SSR environment and disappear. In Vite 6+/8 environment-aware HMR, `server.ws.send` style code can be too blunt for plugins that need client-vs-SSR routing.

**Why it happens:**
Vite's current docs distinguish old `handleHotUpdate`/`server.ws.send` examples from the environment-aware `hotUpdate` hook, where custom events should be sent via `this.environment.hot.send`. The local upstream Qwik plugin specifically detects the `ssr` environment, collects source modules, then forwards `qwik:hmr` to `viteServer.environments.client.hot.send(...)` so browser-loaded QRL segments receive the update.

**How to avoid:**

- Implement Vite HMR wiring in a Vite-only module, not generic Rolldown code.
- In `hotUpdate`, branch explicitly by `this.environment.name` / consumer: update Qwik caches in the current environment, but send browser custom events to the client HMR channel.
- Preserve a narrow callback API from generic dev segment code for parent transforms; do not pass the whole Vite server deep into segment logic.
- Test an SSR/Nitro-style source edit where `ctx.modules` belong to SSR but the client receives `qwik:hmr`.

**Warning signs:**

- Code calls only `server.ws.send` or only `this.environment.hot.send` from the current SSR environment without an explicit client-environment forward.
- HMR works in CSR fixture but not in SSR/Nitro fixture.
- Generic `src/dev.ts` starts depending on `ViteDevServer` internals instead of a small `transformParent`/`sendClientEvent` callback.

**Phase to address:**
Phase 2: Vite `hotUpdate` transport and SSR-to-client forwarding.

---

### Pitfall 3: Failing to invalidate stale optimizer segment caches

**What goes wrong:**
The browser reloads or accepts an update but receives old segment code. Edits sometimes appear only after a second save or after restarting Vite.

**Why it happens:**
The rewrite keeps extracted Qwik segments in maps. Upstream Qwik clears `clientResults`, deletes transformed segment outputs whose parent changed, and invalidates the corresponding Vite module graph nodes. Without this, virtual QRL IDs continue serving stale transformed code even though Vite detected the file change.

**How to avoid:**

- Track parent source IDs for every dev segment.
- On hot update, delete every segment whose parent is the changed module before re-transforming.
- Invalidate the Vite module graph node for each deleted virtual/dev segment with the update timestamp when available.
- Add a unit test that transforms a parent, changes it, invokes HMR invalidation, and verifies a subsequent segment load is regenerated from the new parent.

**Warning signs:**

- Segment maps only ever grow during dev.
- HMR tests do not inspect cache deletion or module graph invalidation.
- `load()` can return `segments.get(id)` after the parent source was updated.

**Phase to address:**
Phase 1 for cache model; Phase 2 for Vite graph invalidation.

---

### Pitfall 4: Mis-resolving dev QRL segment URLs

**What goes wrong:**
Browser requests for URLs like `/src/foo.tsx_symbol.js` 404, resolve to the wrong environment's segment, or fail on Windows/path-query variants. HMR messages reference one path shape while segment IDs are stored under another.

**Why it happens:**
Qwik dev QRLs are not physical files. Upstream resolves patterns of the form `parent.[jt]sx_name.js`, remembers parent IDs, strips Vite query suffixes, recovers the parent from browser requests, and sometimes transforms the parent on demand before serving the segment. The current rewrite already has `src/dev.ts` path-shape helpers; HMR must not bypass them with ad hoc string logic.

**How to avoid:**

- Centralize path parsing/normalization in the dev segment module using `ufo` and `pathe` as repository rules require.
- Store segment aliases for encoded virtual IDs, absolute source paths, and root-relative dev paths when needed.
- Preserve importer-parent fallback resolution for imports inside virtual QRL segments.
- Test at least: root-relative URL, relative import from a segment, `?v=`/query stripped request, and server/client environment separation.

**Warning signs:**

- Regexes use raw string slicing instead of shared `pathname()`/normalization helpers.
- Works on macOS absolute paths but fails for Vite browser URLs or Windows-style separators.
- Segment IDs do not include environment, causing client and server outputs to overwrite each other.

**Phase to address:**
Phase 1: dev segment resolution/loading.

---

### Pitfall 5: Making HMR mode leak into production, SSR build, or library mode

**What goes wrong:**
Production bundles include HMR bridge code, library builds emit dev-only QRL accept handlers, or SSR builds use client segment strategy. Library output loses its `.qwik.mjs` semantics or production manifests/chunks drift.

**Why it happens:**
Qwik uses different optimizer modes and entry strategies by target: dev/HMR segment behavior for Vite serve, hoist for SSR, inline for library, smart/prod for client builds. Public Qwik library docs also emphasize `.qwik.mjs` output as optimizer-recognized library output. A bundler rewrite can accidentally set `options.dev` too broadly or mutate shared Rolldown options used by build fixtures.

**How to avoid:**

- Gate HMR strictly to Vite `serve` and an enabled `hmr` option; raw Rolldown, build, SSR production, and library mode should not get browser HMR code.
- Keep `entryStrategy(environment, value)` target-sensitive: server stays hoist, library stays inline, client dev/HMR uses segment only when serving.
- Test that library builds contain no `import.meta.hot`, no HMR bridge import, and preserve expected `.qwik` outputs.
- Test that SSR/Nitro build outputs and manifest injection remain unchanged with HMR code present in the codebase.

**Warning signs:**

- `options.dev = true` is set outside Vite serve or shared between build invocations.
- `import.meta.hot` appears in built library/client production fixtures.
- A library fixture starts emitting separate segment chunks instead of inline `.qwik` output.

**Phase to address:**
Phase 3: opt-out/build-mode safety and fixture regression suite.

---

### Pitfall 6: Breaking `hmr: false` fallback behavior

**What goes wrong:**
Users opt out of Qwik component HMR, but edits silently do nothing, still preserve stale DOM, or only reload in CSR but not SSR/Nitro.

**Why it happens:**
Upstream Qwik treats `devTools.hmr ?? true` as enabled by default and sends a client full reload when disabled. Vite docs require manually invalidating modules and sending a `full-reload` event when a plugin takes over HMR handling and returns an empty update list.

**How to avoid:**

- Make `hmr: false` a first-class branch in the Vite HMR plugin: invalidate affected modules and send `full-reload` to the client environment.
- Do not inject the Qwik HMR bridge or segment accept code when HMR is disabled.
- Test default enabled, explicit `hmr: false`, and syntax/error update paths.

**Warning signs:**

- Option is named or scoped differently from project expectations, making opt-out hard to discover.
- Disabled HMR still emits `qwik:hmr` custom events.
- No test asserts full reload behavior.

**Phase to address:**
Phase 2: transport opt-out branch; Phase 3: browser/fixture verification.

---

### Pitfall 7: Duplicating or taking over Vite's client runtime

**What goes wrong:**
Development HTML includes duplicate `@vite/client` scripts, HMR connects twice, or user/framework-managed HTML entry handling breaks.

**Why it happens:**
Vite owns the HMR client injection for standard HTML handling. The project context explicitly excludes manually injecting `@vite/client`. Upstream Qwik's dev HTML hook injects Qwik dev tools/scripts, not the Vite HMR client itself. Adding HMR can tempt implementers to inject a second transport runtime.

**How to avoid:**

- Inject only a Qwik HMR bridge virtual module or script in Vite serve mode; never manually inject `@vite/client` unless a failing fixture proves Vite omitted it.
- Keep bridge injection separate from static CSR preloader injection.
- Use Vite `transformIndexHtml` only for dev-only Qwik tags, and keep build-time static HTML mutation in `src/build/static-html.ts`.

**Warning signs:**

- HTML snapshots contain two `@vite/client` references.
- HMR event handlers fire twice per save.
- HMR implementation modifies `src/build/static-html.ts` or preloader code to solve a dev transport problem.

**Phase to address:**
Phase 2: bridge injection; Phase 3: HTML/static regression checks.

---

### Pitfall 8: Coupling HMR to static CSR preloader or SSR render markers

**What goes wrong:**
Static CSR pages lose modulepreload/bootstrap tags, SSR/SSG pages receive duplicate preloader tags, or HMR changes alter production HTML assets.

**Why it happens:**
Static CSR HTML does not run Qwik SSR rendering, so this rewrite has an isolated production helper that injects Qwik preloader tags and skips HTML marked `q:render="ssr"` / `q:render="ssr-dev"`. HMR is a Vite serve concern; mixing bridge injection into build static HTML handling risks regressing CSR, SSR/Nitro, and SSG behavior.

**How to avoid:**

- Do not touch `src/build/static-html.ts` for HMR except to add regression tests if needed.
- Keep HMR bridge injection in Vite serve-only code.
- Preserve the SSR render marker skip logic and add HTML snapshot tests covering CSR static, SSR, and SSR-dev markers after HMR lands.

**Warning signs:**

- HMR bridge strings appear in production HTML assets.
- Static HTML helper starts checking Vite dev-server state.
- SSR/SSG HTML snapshots gain duplicate preloader/modulepreload tags.

**Phase to address:**
Phase 3: static HTML and build regression verification.

---

### Pitfall 9: Letting Qwik dependencies be pre-bundled or externalized incorrectly

**What goes wrong:**
HMR works for local components but fails for Qwik component libraries, or runtime state splits across duplicate Qwik core instances. SSR/Nitro may load a Qwik dependency externally and skip optimizer processing.

**Why it happens:**
Upstream Qwik explicitly excludes Qwik core packages from Vite dep optimization, dedupes aliases, and checks Qwik-using dependencies so they are not externalized in SSR. The local rewrite already has a `qwik-external` workaround. HMR increases the visibility of this mistake because changed library QRLs must be optimizer-transformed and routed through the same client runtime.

**How to avoid:**

- Preserve `optimizeDeps.exclude`, `resolve.dedupe`, and SSR `noExternal` behavior for Qwik core and Qwik libraries.
- Add a fixture with a local `.qwik` library dependency and verify both build output and Vite serve HMR.
- Fail loudly when a pre-bundled dependency appears to import/use Qwik but bypasses the optimizer.

**Warning signs:**

- Vite `.vite/deps` output contains transformed Qwik component code.
- Errors mention duplicate Qwik runtimes or missing QRL symbols only when editing a dependency.
- Library fixture passes build but HMR never updates dependency components.

**Phase to address:**
Phase 3: dependency/library fixture safety.

---

### Pitfall 10: No acknowledgment/fallback path for failed Qwik updates

**What goes wrong:**
The app remains in a half-updated state: Vite reports success, but Qwik did not match the changed file to active code. State is preserved incorrectly and the DOM is stale until the user reloads.

**Why it happens:**
Upstream bridge code records a timestamp, dispatches `qHmr`, and reloads if Qwik does not acknowledge completion by updating `document.__hmrDone` to the event timestamp. Without an acknowledgment timeout, failed matches are silent.

**How to avoid:**

- Keep a small browser bridge with duplicate-update suppression, timestamp tracking, `qHmr` dispatch, and timeout-based full reload fallback.
- Make timeout duration configurable only if a test or real fixture needs it; default to a simple conservative value.
- Add a browser smoke test where the bridge receives an unacknowledged update and triggers reload.

**Warning signs:**

- Bridge only dispatches `qHmr` and never reloads on mismatch.
- Console shows repeated duplicate updates or stale timestamps.
- HMR failures require manually refreshing the page.

**Phase to address:**
Phase 2: bridge runtime; Phase 3: browser smoke tests.

---

## Technical Debt Patterns

| Shortcut                                                       | Immediate Benefit         | Long-term Cost                                                                     | When Acceptable                                                |
| -------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Passing the full `ViteDevServer` into generic dev segment code | Fast implementation       | Couples Rolldown/dev segment logic to Vite internals and blocks raw Rolldown reuse | Never; use narrow callbacks                                    |
| Copying upstream Qwik Vite plugin wholesale                    | Reduces missed behavior   | Imports router/app/preview complexity this package explicitly excludes             | Never as architecture; acceptable only as behavioral reference |
| One global segment map for all environments                    | Simpler storage           | Client/server/library segments overwrite each other; SSR HMR breaks client runtime | Never                                                          |
| String-slicing paths ad hoc                                    | Quick fix for one fixture | Cross-platform and browser URL failures                                            | Only inside a tested helper, not scattered                     |
| Verifying only unit tests, no fixture/browser smoke            | Faster milestone          | Misses CSR vs SSR/Nitro vs library regressions                                     | MVP only if roadmap explicitly schedules follow-up smoke tests |

## Integration Gotchas

| Integration          | Common Mistake                                                               | Correct Approach                                                                           |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Vite HMR API         | Relying on non-literal `accept` wrappers                                     | Emit literal guarded `if (import.meta.hot) import.meta.hot.accept(` in served segment code |
| Vite Environment API | Sending SSR updates on SSR HMR channel only                                  | Forward source-file updates from SSR environment to the client HMR channel                 |
| Qwik optimizer       | Using `mode: 'dev'` when HMR-specific segment output is required             | Use optimizer HMR mode only in Vite serve with HMR enabled; preserve lib/prod/server modes |
| Qwik runtime         | Expecting Vite module replacement to re-render Qwik components automatically | Dispatch Qwik's `qHmr` browser event with matching file list and timestamp                 |
| Static HTML build    | Injecting HMR bridge via production static HTML helper                       | Keep bridge in Vite serve; keep preloader injection isolated to build helper               |

## Performance Traps

| Trap                                           | Symptoms                                               | Prevention                                                                         | When It Breaks                     |
| ---------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------- |
| Re-transforming all source files on every save | Slow HMR as project grows                              | Track parent-to-segment mapping and invalidate only affected segments              | Medium apps with many QRLs         |
| Letting segment maps grow forever              | Memory growth during long dev sessions; stale segments | Delete old parent segments on hot update                                           | Long-running Vite dev servers      |
| Forwarding every changed module URL to Qwik    | Excess duplicate re-renders and noisy reload fallback  | Filter to JS/TS/MDX source URLs; for non-source JS-like modules, send JS importers | CSS/asset-heavy components         |
| Duplicate bridge/listeners                     | Two updates per save; flicker/reload loops             | Inject bridge once and suppress duplicate timestamps                               | Any app with multiple HTML entries |

## Security Mistakes

| Mistake                                                   | Risk                                                  | Prevention                                                                               |
| --------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Enabling editor/open-in-editor helpers outside dev        | Local file path disclosure or unwanted process launch | Keep dev tools behind Vite serve only; do not add app/router dev helpers to bundler core |
| Sending absolute filesystem paths to browser HMR payloads | Leaks local paths in browser logs/events              | Send root-relative Vite dev URLs only                                                    |
| Embedding unescaped file names in generated bridge code   | Script injection if paths are malformed               | Use `JSON.stringify` for every generated payload/code string                             |

## UX Pitfalls

| Pitfall                              | User Impact                               | Better Approach                                                            |
| ------------------------------------ | ----------------------------------------- | -------------------------------------------------------------------------- |
| Silent failed update                 | Developer sees stale UI and distrusts HMR | Reload automatically when Qwik does not acknowledge update                 |
| Losing state on every component edit | HMR feels no better than reload           | Default Qwik HMR on; only full reload for opt-out or failed acknowledgment |
| HMR only works in CSR fixture        | Nitro/SSR users hit reload or stale UI    | Include SSR-to-client forwarding tests before declaring complete           |

## "Looks Done But Isn't" Checklist

- [ ] **Bridge injection:** Browser receives one Qwik bridge in Vite serve and zero bridge code in production/library output.
- [ ] **Segment accept:** Dev QRL segment code contains literal `import.meta.hot.accept(` and dispatches `qHmr`.
- [ ] **Server forwarding:** An SSR/Nitro source edit sends `qwik:hmr` to the client environment.
- [ ] **Cache invalidation:** Edited parent modules delete stale extracted segment outputs before reload/accept.
- [ ] **Opt-out:** `hmr: false` causes client full reload and no Qwik bridge/segment accept injection.
- [ ] **Static HTML:** CSR static preloader tags still inject; SSR/SSG `q:render="ssr"` and `q:render="ssr-dev"` HTML still skip duplicate injection.
- [ ] **Library mode:** Build output contains no HMR runtime and preserves `.qwik` library expectations.
- [ ] **Path shapes:** Root-relative, absolute, query-suffixed, and virtual segment IDs resolve to the same intended segment.

## Recovery Strategies

| Pitfall                     | Recovery Cost | Recovery Steps                                                                                                               |
| --------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Wrong environment transport | MEDIUM        | Move HMR wiring into Vite-specific module; add SSR-to-client forwarding tests; remove server internals from generic dev code |
| Stale segment caches        | MEDIUM        | Introduce parent index, clear affected segments on update, invalidate Vite module graph nodes                                |
| HMR leaked into builds      | HIGH          | Add serve/build gates, snapshot production/library outputs, audit optimizer mode selection                                   |
| Static HTML regression      | HIGH          | Revert HMR changes from `static-html.ts`; restore marker skip tests; isolate bridge to dev HTML/virtual module               |
| Path resolution mismatch    | MEDIUM        | Centralize parsing helpers; add matrix tests for path/query/environment shapes                                               |

## Pitfall-to-Phase Mapping

| Pitfall                                      | Prevention Phase | Verification                                                                        |
| -------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| Ordinary module self-acceptance assumption   | Phase 1          | Unit test segment accept code and `qHmr` dispatch                                   |
| Wrong Vite environment transport             | Phase 2          | SSR hot update sends client `qwik:hmr` custom event                                 |
| Stale optimizer segment caches               | Phase 1/2        | Parent edit invalidates and regenerates segment code                                |
| Dev QRL URL mis-resolution                   | Phase 1          | Resolution/load tests for root-relative, relative, query, and env-specific IDs      |
| HMR leaking into production/library          | Phase 3          | CSR/SSR/library builds contain no HMR strings and preserve fixture snapshots        |
| Broken `hmr: false` fallback                 | Phase 2/3        | Opt-out test observes full reload and no bridge injection                           |
| Duplicate Vite client/runtime                | Phase 2/3        | HTML snapshot contains no manual duplicate `@vite/client`; browser events fire once |
| Static CSR/SSR HTML coupling                 | Phase 3          | Static CSR preloader still injects; SSR markers still skip                          |
| Qwik dependency pre-bundling/externalization | Phase 3          | Local Qwik library fixture passes build and HMR smoke                               |
| Missing acknowledgment fallback              | Phase 2/3        | Bridge reloads on unacknowledged update                                             |

## Sources

- Local project context: `.planning/PROJECT.md` (2026-05-09), HIGH confidence.
- Local upstream Qwik Vite plugin reference: `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/vite.ts`, especially `QWIK_HMR_BRIDGE_CODE`, `transformIndexHtml`, `hotUpdate`, and dev tool options, HIGH confidence.
- Local upstream Qwik optimizer plugin internals: `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/plugin.ts`, especially dev QRL resolution/loading, segment cache invalidation, optimizer `mode`, and `QwikPluginDevTools.hmr`, HIGH confidence.
- Current rewrite files: `src/dev.ts`, `src/vite.ts`, `src/rolldown.ts`, `src/build/static-html.ts`, HIGH confidence for local architecture constraints.
- Vite official docs v8.0.10, HMR API: https://vite.dev/guide/api-hmr — static `import.meta.hot.accept(` requirement, custom events, guards, HIGH confidence.
- Vite official docs v8.0.10, Plugin API: https://vite.dev/guide/api-plugin.html — `transformIndexHtml`, plugin ordering, path normalization, `handleHotUpdate`, custom client-server events, HIGH confidence.
- Context7 Vite docs lookup `/vitejs/vite`: `hotUpdate` environment-aware custom events/full reload examples and migration from `handleHotUpdate`, HIGH confidence.
- Qwik official docs, QRL: https://qwik.dev/docs/advanced/qrl/ — QRL lazy URL/symbol model and q:base resolution, HIGH confidence.
- Qwik official docs, Optimizer: https://qwik.dev/docs/advanced/optimizer/ — `$` extraction into lazy-loadable symbols, HIGH confidence.
- Qwik official docs, Vite: https://qwik.dev/docs/advanced/vite/ — Qwik uses Vite for fast dev and HMR; docs page appears older than local upstream API for `devTools.hmr`, MEDIUM confidence.
- Qwik official docs, Library mode: https://qwik.dev/docs/advanced/library/ — `.qwik.mjs` library output expectations, HIGH confidence.

---

_Pitfalls research for: Qwik bundler Vite HMR implementation_  
_Researched: 2026-05-09_
