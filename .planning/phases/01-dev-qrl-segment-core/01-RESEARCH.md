# Phase 1: Dev QRL Segment Core - Research

**Researched:** 2026-05-09  
**Domain:** Qwik dev QRL segment resolution/loading, Vite serve transform callbacks, HMR self-acceptance, and cache invalidation  
**Confidence:** HIGH

## User Constraints

No phase `CONTEXT.md` exists, so there are no additional locked decisions, discretion notes, or deferred ideas beyond `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, and `AGENTS.md`. [VERIFIED: `gsd-sdk query init.phase-op "1"`]

## Phase Requirements

| ID      | Description                                                                                                                                                                      | Research Support                                                                                                                                                                                                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEGM-01 | Browser requests for generated dev QRL segment URLs resolve to the correct parent source module and generated segment identity.                                                  | Use centralized dev QRL parsing, `pathname()` query stripping, root-relative `devPath`, and encoded segment IDs containing the Qwik environment. [VERIFIED: `.planning/REQUIREMENTS.md`; `src/dev.ts`; `src/rolldown.ts`]                                       |
| SEGM-02 | If a generated QRL segment is requested before its parent has been transformed, the segment loader invokes a narrow parent-transform callback and returns the generated segment. | Keep `QwikDevServer` as a narrow `{ transformRequest }` interface and choose the Vite client/SSR environment callback inside dev segment code. [VERIFIED: `src/dev.ts`; `git show HMR:src/dev.ts`; upstream `plugin.ts:711-724`]                                |
| SEGM-03 | Client and SSR dev segment caches are isolated so transforms from one Vite environment cannot overwrite the other.                                                               | Segment cache keys must include `'client'` or `'server'`, and invalidation must operate against the matching environment cache/graph only. [VERIFIED: `src/rolldown.ts:389-390`; upstream `plugin.ts:710`, `1124`]                                              |
| SEGM-04 | Editing a parent source file invalidates all generated QRL segments derived from that parent.                                                                                    | Add/maintain a parent-to-segment index, delete generated segment entries for changed parents, and invalidate corresponding Vite module graph nodes where Vite context is available. [VERIFIED: upstream `plugin.ts:1120-1143`; `.planning/research/SUMMARY.md`] |
| SEGM-05 | Non-worker dev QRL segment modules include literal `import.meta.hot.accept(` code when HMR is enabled.                                                                           | Append literal self-accept code only for HMR-enabled dev segment loads; upstream skips `worker$` segments and includes a document guard. [VERIFIED: upstream `plugin.ts:739-751`; upstream `plugin.unit.ts:305-420`; Vite docs via Context7]                    |
| SEGM-06 | Dev segment URL and source-path normalization handles query strings, root-relative paths, absolute filesystem paths, and platform path separators consistently.                  | Use `ufo.parsePath()` for query/hash stripping and `pathe`/normalization helpers instead of hand-rolled URL/path logic. [VERIFIED: `src/dev.ts`; `AGENTS.md`; `git show HMR:src/hmr.ts`]                                                                        |
| TEST-05 | Unit tests cover dev segment loading with appended HMR accept code.                                                                                                              | Existing `test/rolldown-runtime.test.ts` covers dev segment load basics; add cases asserting literal accept code and disabled/worker exclusions. [VERIFIED: `test/rolldown-runtime.test.ts`; upstream `plugin.unit.ts:305-420`]                                 |
| TEST-06 | Focused tests verify generated segment invalidation and parent-transform callback behavior.                                                                                      | Existing callback test covers parent transform; add cache invalidation, environment isolation, and normalization cases. [VERIFIED: `test/rolldown-runtime.test.ts:222-233`; upstream `plugin.ts:1120-1143`]                                                     |

## Summary

Phase 1 should plan a targeted strengthening of the generic dev segment core, not the full Vite transport or browser bridge. The current rewrite already has the main seam: `src/dev.ts` owns dev QRL URL resolution/loading through a narrow `QwikDevServer` callback, and `src/rolldown.ts` owns optimizer transforms plus the shared `segments` map. [VERIFIED: `src/dev.ts`; `src/rolldown.ts`] The missing planning focus is to make this seam reliable under HMR: explicit parent indexes, per-environment segment keys, invalidation primitives, and HMR self-accept code generation. [VERIFIED: `.planning/ROADMAP.md`; upstream `plugin.ts:739-751`, `1120-1143`]

Use the local upstream Qwik Vite plugin and the local `HMR` reference branch as behavioral references, but keep the rewrite simpler than upstream. [VERIFIED: `AGENTS.md`; `git show HMR:src/dev.ts`; upstream `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/plugin.ts`] The planner should split work so Phase 1 exposes testable generic helpers/primitives and leaves Vite custom event forwarding, bridge injection, SSR-to-client forwarding, and full-reload behavior to Phase 2. [VERIFIED: `.planning/ROADMAP.md`; `.planning/research/SUMMARY.md`]

**Primary recommendation:** Implement `src/dev.ts` as the canonical dev QRL segment state machine: parse/normalize URLs, record parent→segment mappings per environment, lazy-transform parents through a narrow callback, append HMR accept code when enabled, and expose invalidation helpers that Vite-specific code can call later. [VERIFIED: `src/dev.ts`; `git show HMR:src/dev.ts`; upstream `plugin.ts`]

## Project Constraints (from AGENTS.md)

- Compare Vite, dev-server, HMR, optimizer, and related bundler behavior against `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins` first. [VERIFIED: `AGENTS.md`]
- Keep this rewrite simpler and easier to read than upstream unless a fixture or test proves the extra complexity is needed. [VERIFIED: `AGENTS.md`]
- Keep HMR code split between dev segment handling, Vite HMR wiring, and browser bridge code. [VERIFIED: `AGENTS.md`]
- Avoid passing Vite server internals deep into generic dev segment code; prefer narrow callbacks for parent transforms. [VERIFIED: `AGENTS.md`]
- Vite owns the full dev/HMR browser experience; raw Rolldown remains build/library/server tooling unless a separate dev server is intentionally added. [VERIFIED: `AGENTS.md`]
- HMR should be automatic in Vite serve and opt-out via `hmr: false`. [VERIFIED: `AGENTS.md`]
- `src/rolldown.ts` owns bundler integration, optimizer transforms, manifest creation, and output hooks. [VERIFIED: `AGENTS.md`]
- `src/vite.ts` owns Vite adapter wiring only. [VERIFIED: `AGENTS.md`]
- Prefer `ufo` for URL handling and `pathe` for filesystem-style path handling instead of hand-rolled string logic. [VERIFIED: `AGENTS.md`]
- Add robust failing tests before behavior changes; preserve CSR, SSR/Nitro, and library fixture behavior. [VERIFIED: `AGENTS.md`]

## Architectural Responsibility Map

| Capability                                    | Primary Tier                               | Secondary Tier   | Rationale                                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dev QRL URL parsing and segment identity      | API / Backend (Vite plugin server runtime) | Browser / Client | Vite requests generated module URLs, but server-side plugin hooks resolve them into virtual segment modules. [VERIFIED: `src/dev.ts`; Vite docs via Context7]                        |
| Parent source transform on segment cache miss | API / Backend (Vite plugin server runtime) | —                | The parent transform must call Vite `transformRequest` through a narrow callback, not browser code. [VERIFIED: `src/dev.ts`; upstream `plugin.ts:711-724`]                           |
| Per-environment segment cache isolation       | API / Backend (Vite/Rolldown plugin state) | —                | Client and SSR transforms run in different Vite environments and must key generated modules separately. [VERIFIED: `src/rolldown.ts:389-390`; upstream `plugin.ts:710`]              |
| Segment self-accept code                      | Browser / Client                           | API / Backend    | The plugin appends literal client HMR code to generated modules, and the browser executes `import.meta.hot.accept`. [VERIFIED: upstream `plugin.ts:739-751`; Vite docs via Context7] |
| Parent edit invalidation                      | API / Backend (Vite plugin server runtime) | Browser / Client | Server-side hot update invalidates generated segment modules; later phases notify the browser bridge. [VERIFIED: upstream `plugin.ts:1120-1143`; `.planning/ROADMAP.md`]             |
| Unit verification                             | API / Backend (test harness)               | —                | Existing tests invoke plugin hooks directly in Vitest without launching a browser. [VERIFIED: `test/helpers.ts`; `vite.config.ts`]                                                   |

## Standard Stack

### Core

| Library               | Version                                                            | Purpose                                                             | Why Standard                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@qwik.dev/optimizer` | 2.1.0-beta.2; npm modified 2026-04-30                              | Generates Qwik optimizer transform outputs and QRL segment modules. | Existing project dependency and the authoritative boundary for `$`/QRL extraction; do not hand-write a QRL parser. [VERIFIED: npm registry; `package.json`; Qwik docs via Context7] |
| `vite`                | project `^8.0.10`; npm current 8.0.11, modified 2026-05-07         | Provides dev server transform callbacks and HMR APIs.               | Existing peer/dev dependency; Vite owns browser dev/HMR. [VERIFIED: npm registry; `package.json`; Vite docs via Context7; `AGENTS.md`]                                              |
| `rolldown`            | project `^1.0.0-rc.18`; npm current 1.0.0, modified 2026-05-07     | Plugin hook host for core bundler behavior.                         | Existing peer/dev dependency; raw Rolldown remains build/library/server tooling, not browser HMR transport. [VERIFIED: npm registry; `package.json`; `AGENTS.md`]                   |
| `vitest`              | project `^4.0.18`; resolved/current 4.1.5, npm modified 2026-05-05 | Unit test runner for plugin hook behavior.                          | Existing test infrastructure already runs `test/**/*.test.ts` in Node. [VERIFIED: npm registry; `vite.config.ts`; `package.json`]                                                   |

### Supporting

| Library    | Version                        | Purpose                                                            | When to Use                                                                                                                                     |
| ---------- | ------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ufo`      | 1.6.4; npm modified 2026-04-29 | URL/pathname parsing and query stripping.                          | Use for dev QRL IDs with queries/hashes and virtual module path comparison. [VERIFIED: npm registry; `src/dev.ts`; `AGENTS.md`]                 |
| `pathe`    | 2.0.3; npm modified 2025-02-11 | Cross-platform filesystem-style path normalization/relative paths. | Use for root-relative `devPath`, absolute path normalization, and parent URL normalization. [VERIFIED: npm registry; `src/dev.ts`; `AGENTS.md`] |
| TypeScript | project `^5.9.3`               | Strict implementation and tests.                                   | Keep helper types explicit; project uses strict TS and `moduleResolution: 'bundler'`. [VERIFIED: `package.json`; `AGENTS.md`]                   |

### Alternatives Considered

| Instead of                              | Could Use                                                  | Tradeoff                                                                                                                                                                                                                                                     |
| --------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@qwik.dev/optimizer` segment metadata  | Custom QRL filename parser/AST transform                   | Reject: Qwik docs define `$`/QRL as optimizer-managed lazy-load output, and custom parsing would miss optimizer edge cases. [CITED: https://github.com/qwikdev/qwik/blob/main/packages/docs/src/routes/api/qwik/index.mdx; VERIFIED: Qwik docs via Context7] |
| Vite `transformRequest` narrow callback | Passing full `ViteDevServer` into generic dev segment code | Reject: contradicts project architecture and makes generic code Vite-specific. [VERIFIED: `AGENTS.md`; `src/dev.ts`]                                                                                                                                         |
| Hand-written query/path string logic    | `ufo` + `pathe`                                            | Reject: project explicitly prefers these libraries and current code already uses them. [VERIFIED: `AGENTS.md`; `src/dev.ts`]                                                                                                                                 |

**Installation:** No new packages are recommended. [VERIFIED: `package.json`; npm registry]

## Architecture Patterns

### System Architecture Diagram

```text
Browser import of generated dev QRL URL
  -> Vite resolveId hook (`src/rolldown.ts` delegates to `src/dev.ts`)
    -> parse/normalize QRL URL and encode environment-scoped segment ID
      -> Vite load hook (`src/dev.ts`)
        -> segment cache hit? yes -> return generated code (+ HMR accept when enabled)
        -> segment cache hit? no
          -> parent known? yes -> call narrow parent transform callback
            -> optimizer transform records parent-derived segments
            -> return generated code (+ HMR accept when enabled)
          -> parent unknown -> not handled / null

Parent source edit in Vite dev
  -> Vite hot update context (Phase 2 owner)
    -> Phase 1 invalidation primitive receives environment + parent/source ID
      -> delete environment-scoped generated segment entries for that parent
      -> Vite-specific caller invalidates module graph nodes where available
```

### Recommended Project Structure

```text
src/
├── dev.ts          # generic dev QRL segment parsing, cache, parent transform, accept-code hook
├── hmr.ts          # Phase 2 Vite bridge/transport owner if/when added; only shared accept helper if needed
├── rolldown.ts     # optimizer transforms, segment recording, encoded IDs, invalidation delegation
└── vite.ts         # Vite adapter wiring only; no generic segment state
test/
├── rolldown-runtime.test.ts  # focused dev segment/core hook tests
└── vite-plugin.test.ts       # Vite adapter integration hook tests when needed
```

### Pattern 1: Environment-scoped virtual segment IDs

**What:** Encode generated segment IDs as `\0qwik:segment:<environment>:<path>` so client and server segment modules cannot collide. [VERIFIED: `src/rolldown.ts:389-390`]  
**When to use:** Every generated dev segment recorded or resolved through plugin hooks. [VERIFIED: `src/dev.ts`; `src/rolldown.ts`]  
**Example:**

```typescript
// Source: src/rolldown.ts
function segmentId(environment: QwikEnvironment, path: string) {
	return `${SEGMENT}${environment}:${path}`;
}
```

### Pattern 2: Lazy parent transform through a narrow callback

**What:** On segment load miss, transform the parent through `QwikDevServer.transformRequest` or the matching Vite environment callback, then read the segment cache again. [VERIFIED: `src/dev.ts:69-75`; upstream `plugin.ts:711-724`]  
**When to use:** A browser requests a generated QRL segment before the parent module has gone through optimizer transform. [VERIFIED: `.planning/ROADMAP.md`; `test/rolldown-runtime.test.ts:222-233`]  
**Example:**

```typescript
// Source: src/dev.ts
function transformDevParent(server: QwikDevServer, environment: QwikEnvironment, parent: string) {
	const devEnvironment = server.environments?.[environment === 'server' ? 'ssr' : 'client'];
	return devEnvironment?.transformRequest(parent) ?? server.transformRequest(parent);
}
```

### Pattern 3: Literal self-accept code appended at segment load time

**What:** Append literal `import.meta.hot.accept(` code to non-worker dev QRL segment modules when HMR is enabled. [VERIFIED: upstream `plugin.ts:739-751`; Vite docs via Context7]  
**When to use:** Vite serve + HMR enabled + generated segment is not from `worker$`. [VERIFIED: upstream `plugin.unit.ts:305-420`]  
**Example:**

```typescript
// Source: upstream plugin.ts simplified for this rewrite
code +=
	`\nif (import.meta.hot && typeof document !== 'undefined') {import.meta.hot.accept(()=>{` +
	`document.dispatchEvent(new CustomEvent('qHmr', {detail: {files:[${JSON.stringify(parentUrl)}], t: document.__hmrT}}));` +
	`});}`;
```

### Anti-Patterns to Avoid

- **Passing `ViteDevServer` through generic segment code:** use a small callback interface instead. [VERIFIED: `AGENTS.md`; `src/dev.ts`]
- **Using one segment map key for both client and SSR:** include environment in the key. [VERIFIED: `src/rolldown.ts:389-390`; upstream `plugin.ts:710`]
- **Appending HMR accept code to `worker$` segments:** upstream tests explicitly skip worker HMR wrapper. [VERIFIED: upstream `plugin.unit.ts:305-336`]
- **Planning Phase 2 bridge work into Phase 1:** bridge injection and custom event transport are later-phase responsibilities. [VERIFIED: `.planning/ROADMAP.md`]

## Don't Hand-Roll

| Problem                       | Don't Build                                  | Use Instead                                                                       | Why                                                                                                                                                                   |
| ----------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qwik QRL extraction           | Custom AST/QRL parser                        | `@qwik.dev/optimizer.transformModules()`                                          | Qwik docs describe `$` as optimizer-extracted lazy-load output; optimizer returns segment metadata/code. [CITED: Qwik docs via Context7; VERIFIED: `src/rolldown.ts`] |
| URL query stripping           | Regex-only path cleanup everywhere           | `ufo.parsePath()` wrapper                                                         | Current code already centralizes pathname extraction; queries must not break dev segment identity. [VERIFIED: `src/dev.ts`]                                           |
| Cross-platform relative paths | Manual slash replacement as primary strategy | `pathe.relative/resolve/normalize` plus focused slash normalization at boundaries | Project convention prefers `pathe`; Windows-like paths require tests before extra branches. [VERIFIED: `AGENTS.md`; `src/dev.ts`]                                     |
| HMR transport                 | Custom websocket/dev server                  | Vite serve HMR APIs                                                               | Vite owns browser HMR in this project. [VERIFIED: `AGENTS.md`; Vite docs via Context7]                                                                                |

**Key insight:** Phase 1 should provide dependable segment state and accept-code primitives; it should not duplicate Vite's HMR client, upstream's full plugin complexity, or Qwik optimizer semantics. [VERIFIED: `AGENTS.md`; `.planning/research/SUMMARY.md`]

## Common Pitfalls

### Pitfall 1: Segment cache keys omit the Vite environment

**What goes wrong:** SSR and client transforms can overwrite each other or serve the wrong generated module. [VERIFIED: `.planning/REQUIREMENTS.md`; upstream `plugin.ts:710`]  
**Why it happens:** Generated segment filenames can look similar across environments. [VERIFIED: `src/rolldown.ts`; upstream `plugin.ts`]  
**How to avoid:** Keep environment in the encoded segment key and decode it when loading/invalidation needs to select the Vite transform environment. [VERIFIED: `git show HMR:src/dev.ts`; `src/rolldown.ts:389-390`]  
**Warning signs:** Tests pass for client-only transforms but fail when SSR/server context is used. [ASSUMED]

### Pitfall 2: On-demand segment load calls the wrong transform environment

**What goes wrong:** The requested segment remains missing after transforming the parent, or server-generated output appears in client requests. [VERIFIED: `.planning/REQUIREMENTS.md`; `src/dev.ts`]  
**Why it happens:** Vite 8 has environment-aware dev transforms, and fallback `server.transformRequest` may not be enough when environment callbacks exist. [VERIFIED: `src/dev.ts`; Vite docs via Context7]  
**How to avoid:** Map Qwik `'server'` to Vite `'ssr'` and Qwik `'client'` to Vite `'client'`; fallback only when environment callbacks are unavailable. [VERIFIED: `src/dev.ts:122-125`]

### Pitfall 3: HMR self-accept code is not literal

**What goes wrong:** Vite may not detect self-accepting modules if the code shape hides `import.meta.hot.accept(` from static analysis. [VERIFIED: Vite docs via Context7; `.planning/research/SUMMARY.md`]  
**Why it happens:** Generated code helpers can abstract the HMR call too much. [ASSUMED]  
**How to avoid:** Append literal code containing `import.meta.hot.accept(` and assert the literal substring in tests. [VERIFIED: upstream `plugin.ts:747-750`; `.planning/REQUIREMENTS.md`]

### Pitfall 4: Parent edit invalidates only the parent, not generated segments

**What goes wrong:** Browser reimports stale QRL modules after parent edits. [VERIFIED: `.planning/research/SUMMARY.md`; upstream `plugin.ts:1126-1140`]  
**Why it happens:** QRL segments are generated virtual modules, so Vite's parent invalidation does not automatically delete every plugin cache entry unless the plugin tracks parent relationships. [VERIFIED: upstream `plugin.ts:1126-1140`]  
**How to avoid:** Maintain a parent→segment index at record time and expose an invalidation function that removes matching segment cache entries. [VERIFIED: upstream `plugin.ts:1126-1140`; `git show HMR:src/hmr.ts`]

### Pitfall 5: Over-normalizing paths too early

**What goes wrong:** Root-relative URLs, absolute filesystem paths, and query-string module URLs stop matching optimizer `devPath` outputs. [VERIFIED: `.planning/REQUIREMENTS.md`; `src/dev.ts`]  
**Why it happens:** Vite module URLs and filesystem IDs are not the same shape. [VERIFIED: Vite docs via Context7; `src/dev.ts`]  
**How to avoid:** Keep a small normalization boundary: strip query/hash for identity, preserve root-relative `devPath`, and test absolute/root-relative/query/platform cases. [VERIFIED: `src/dev.ts`; `git show HMR:src/hmr.ts`]

## Code Examples

### Vite self-accept and custom events

```javascript
// Source: Vite v8 docs via Context7
if (import.meta.hot) {
	import.meta.hot.accept((newModule) => {
		// module accepted update
	});

	import.meta.hot.on('my-plugin:update', (data) => {
		// custom plugin update
	});
}
```

### Upstream non-worker segment self-accept pattern

```typescript
// Source: /Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/plugin.ts
if (devServer?.hot && parentId && opts.devTools.hmr && segment?.ctxName !== 'worker$') {
	const parentUrl = parentId.startsWith(opts.rootDir!)
		? parentId.slice(opts.rootDir!.length)
		: parentId;
	code +=
		`\nif (import.meta.hot && typeof document !== 'undefined') {import.meta.hot.accept(()=>{` +
		`document.dispatchEvent(new CustomEvent('qHmr', {detail: {files:[${JSON.stringify(parentUrl)}], t: document.__hmrT}}));` +
		`});}`;
}
```

### Current narrow parent-transform callback

```typescript
// Source: src/dev.ts
export interface QwikDevServer {
	environments?: Record<string, { transformRequest: (url: string) => Promise<unknown> }>;
	transformRequest: (url: string) => Promise<unknown>;
}
```

## State of the Art

| Old Approach                                                  | Current Approach                                                                            | When Changed                      | Impact                                                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy single-environment HMR hooks such as `handleHotUpdate` | Vite 8 environment plugin `hotUpdate()` and `this.environment.hot.send()` for custom events | Vite v8 docs current as of 8.0.10 | Phase 2 should use environment APIs; Phase 1 should keep generic segment code free of Vite transport. [VERIFIED: Vite docs via Context7] |
| Segment HMR through bridge events only                        | Generated segment modules also self-accept literal HMR updates                              | Present in local upstream plugin  | Phase 1 must append accept code before transport work can be reliable. [VERIFIED: upstream `plugin.ts:739-751`]                          |
| Full upstream plugin state maps                               | Simpler rewrite with `src/dev.ts` helpers and encoded segment IDs                           | Current rewrite architecture      | Keep implementation focused and test-backed. [VERIFIED: `AGENTS.md`; `src/dev.ts`; `src/rolldown.ts`]                                    |

**Deprecated/outdated:** Do not plan a custom websocket HMR server or manual `@vite/client` injection for Phase 1. [VERIFIED: `.planning/REQUIREMENTS.md`; `AGENTS.md`]

## Assumptions Log

| #   | Claim                                                                                                  | Section         | Risk if Wrong                                             |
| --- | ------------------------------------------------------------------------------------------------------ | --------------- | --------------------------------------------------------- |
| A1  | Tests may fail first in SSR-specific cases if only client transforms are covered.                      | Common Pitfalls | Planner may under-scope environment-isolation test cases. |
| A2  | Generated-code helper abstraction can hide `import.meta.hot.accept(` enough to break static detection. | Common Pitfalls | Planner may not require literal substring assertions.     |

## Open Questions (RESOLVED)

1. **Should Phase 1 introduce `hmr?: boolean` on `QwikRolldownOptions`, or only internal helper gating?**
    - What we know: `hmr: false` is a milestone requirement, and the HMR branch adds `hmr?: boolean` to dev options. [VERIFIED: `.planning/REQUIREMENTS.md`; `git show HMR:src/dev.ts`]
    - RESOLVED: Phase 1 should add only the minimal option/type and internal gating needed for generated segment accept-code tests. Public Vite bridge behavior, custom events, and full reload fallback remain Phase 2 scope. [VERIFIED: `.planning/ROADMAP.md`; `.planning/REQUIREMENTS.md`]
    - Resolution impact: Phase 1 plans may touch `QwikRolldownOptions` only to pass `hmr: false` through accept-code generation; they must not implement Vite bridge injection or browser transport. [VERIFIED: `.planning/ROADMAP.md`]
2. **How much invalidation should Phase 1 wire to Vite module graphs?**
    - What we know: Upstream invalidates generated segment modules in the current Vite environment module graph. [VERIFIED: upstream `plugin.ts:1133-1138`]
    - RESOLVED: Phase 1 should implement generic parent-to-segment invalidation primitives and unit tests only. Vite module graph invalidation and `hotUpdate` wiring remain Phase 2 scope. [VERIFIED: `.planning/ROADMAP.md`; `.planning/research/SUMMARY.md`]
    - Resolution impact: Phase 1 plans should expose a callable invalidation boundary from generic dev segment state, but should not pass Vite server/module graph objects into `src/dev.ts`. [VERIFIED: `AGENTS.md`; `.planning/research/SUMMARY.md`]

## Environment Availability

| Dependency                   | Required By                | Available | Version                                                                          | Fallback                                                                                                       |
| ---------------------------- | -------------------------- | --------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Node.js                      | Test/build runtime         | ✓         | v24.15.0                                                                         | Project minimum is Node >=22, so no fallback needed. [VERIFIED: `node --version`; `package.json`]              |
| pnpm                         | Project scripts            | ✓         | 10.33.2                                                                          | None; project pins pnpm 10.33.2. [VERIFIED: `pnpm --version`; `package.json`]                                  |
| npm registry access          | Version verification       | ✓         | npm 11.12.1 used                                                                 | If offline, rely on lockfile/package versions and mark versions stale. [VERIFIED: `npm --version`; `npm view`] |
| Local upstream Qwik checkout | Required project reference | ✓         | `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins` readable | None for this project rule. [VERIFIED: `AGENTS.md`; `Glob`/`Read`]                                             |
| Local HMR reference branch   | Additional reference       | ✓         | `git show HMR:src/dev.ts` succeeded                                              | Use upstream plugin if ref unavailable. [VERIFIED: `git show HMR:src/dev.ts`]                                  |

**Missing dependencies with no fallback:** None found. [VERIFIED: environment probes]  
**Missing dependencies with fallback:** None for Phase 1. [VERIFIED: environment probes]

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                                                                   |
| --------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | no      | No authentication surface in dev segment loader. [VERIFIED: phase scope]                                                                           |
| V3 Session Management | no      | No session/cookie handling in phase scope. [VERIFIED: phase scope]                                                                                 |
| V4 Access Control     | no      | Dev server module loading is local tooling, not app authorization. [VERIFIED: phase scope; `AGENTS.md`]                                            |
| V5 Input Validation   | yes     | Normalize and constrain dev QRL URL/source paths before resolving/loading generated modules. [VERIFIED: `.planning/REQUIREMENTS.md`; `src/dev.ts`] |
| V6 Cryptography       | no      | No cryptography in phase scope. [VERIFIED: phase scope]                                                                                            |

### Known Threat Patterns for Vite Plugin Dev Module Loading

| Pattern                                                       | STRIDE                                   | Standard Mitigation                                                                                                                                                    |
| ------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malformed generated segment URL resolves to unintended parent | Tampering                                | Centralized parser, query stripping, root-relative/absolute path tests, and no fallback to arbitrary file reads. [VERIFIED: `src/dev.ts`; `.planning/REQUIREMENTS.md`] |
| Vite internals leaked into generic code                       | Information Disclosure / Design boundary | Narrow `QwikDevServer` callback interface only. [VERIFIED: `AGENTS.md`; `src/dev.ts`]                                                                                  |
| Dev-only HMR code leaks into build output                     | Tampering                                | Gate accept code on dev/HMR enabled and verify production/library absence in later phases. [VERIFIED: `.planning/REQUIREMENTS.md`; `.planning/ROADMAP.md`]             |

## Sources

### Primary (HIGH confidence)

- `AGENTS.md` — project constraints, separation of concerns, HMR direction, URL/path library conventions, and verification rules. [VERIFIED: file read]
- `.planning/REQUIREMENTS.md` — Phase 1 requirements SEGM-01 through SEGM-06 and TEST-05/TEST-06. [VERIFIED: file read]
- `.planning/ROADMAP.md` — Phase 1 scope and success criteria. [VERIFIED: file read]
- `.planning/STATE.md` — current focus and reference decisions. [VERIFIED: file read]
- `.planning/research/SUMMARY.md` — milestone-level HMR architecture, risks, and phase implications. [VERIFIED: file read]
- `src/dev.ts`, `src/rolldown.ts`, `src/vite.ts`, `test/helpers.ts`, `test/rolldown-runtime.test.ts`, `vite.config.ts` — local implementation and test baseline. [VERIFIED: file read]
- Local upstream Qwik plugin `/Users/jacksm5pro/dev/open-source/qwik/packages/qwik-vite/src/plugins/plugin.ts`, `vite.ts`, `plugin.unit.ts`, `worker-qrl-chunks.ts` — upstream behavior for segment load, HMR accept code, parent transform, and invalidation. [VERIFIED: file read]
- Local `HMR` reference branch: `git show HMR:src/dev.ts`, `git show HMR:src/hmr.ts`, `git show HMR:src/vite.ts`. [VERIFIED: git show]
- Vite v8.0.10 docs via Context7 CLI `/vitejs/vite/v8.0.10` — HMR API, `import.meta.hot.accept`, custom events, and environment `hotUpdate` examples. [VERIFIED: Context7 CLI]
- Qwik docs via Context7 CLI `/qwikdev/qwik` — QRL lazy loading and optimizer `$` extraction examples. [VERIFIED: Context7 CLI]
- npm registry checks for `@qwik.dev/optimizer`, `vite`, `rolldown`, `vitest`, `ufo`, `pathe`. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)

- None needed for Phase 1 after local upstream, Context7 docs, and package registry verification. [VERIFIED: research process]

### Tertiary (LOW confidence)

- Assumptions A1-A2 in the Assumptions Log. [ASSUMED]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — versions and stack were verified from `package.json`, npm registry, and local code. [VERIFIED: npm registry; `package.json`]
- Architecture: HIGH — current code, upstream plugin, HMR branch, and roadmap agree on the dev segment boundary. [VERIFIED: `src/dev.ts`; upstream `plugin.ts`; `git show HMR:src/dev.ts`; `.planning/ROADMAP.md`]
- Pitfalls: HIGH — cache invalidation, environment isolation, and literal self-accept code are explicit in requirements or upstream code. [VERIFIED: `.planning/REQUIREMENTS.md`; upstream `plugin.ts`]

**Research date:** 2026-05-09  
**Valid until:** 2026-06-08 for Phase 1 local implementation guidance; re-check Vite/npm versions if planning uses newly released APIs. [ASSUMED]
