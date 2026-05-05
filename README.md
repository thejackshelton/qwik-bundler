# Qwik Bundler

This package hosts the Qwik plugins for Rolldown-powered builds. It exposes the Rolldown plugin at `qwik-bundler/rolldown` and the Vite wrapper at `qwik-bundler/vite`.

## Optimizer Rewrite Integration

The current optimizer boundary is intentionally small. `src/rolldown.ts` imports `createOptimizer` and the optimizer types from `@qwik.dev/optimizer`, forwards `QwikRolldownOptions.optimizerOptions`, and calls `transformModules` from the Rolldown `transform` hook.

The TypeScript optimizer rewrite should keep that adapter boundary stable unless there is a concrete reason to change the plugin API.

### Contract to Preserve

- `createOptimizer(options.optimizerOptions)` is initialized lazily and may be async.
- `transformModules` must accept TypeScript and JSX input because Rolldown runs its internal TS/JSX lowering after plugin `transform` hooks.
- Source modules passed to the optimizer use `stripQuery(id)` as the optimizer path.
- Client builds default to `entryStrategy: { type: 'smart' }`, server builds use `{ type: 'hoist' }`, and library builds use `{ type: 'inline' }`.
- Client and server builds use optimizer mode `prod`; library builds use mode `lib`.
- The adapter currently passes `minify: 'simplify'`, `transpileTs: true`, `transpileJsx: true`, `explicitExtensions: true`, and `preserveFilenames: true`.
- Optimizer result modules with a `segment` become virtual Rolldown chunks using the `\0qwik:segment:<environment>:<path>` id prefix.
- Client segment analysis is collected into the Qwik manifest in `generateBundle`.
- Server output replaces `globalThis.__QWIK_MANIFEST__` with either `manifestInput` or the client manifest cached for the same root.

### Integration Steps

1. Replace the optimizer import boundary in `src/rolldown.ts` only after the TypeScript rewrite exposes equivalent `createOptimizer`, `OptimizerOptions`, `TransformModule`, `SegmentAnalysis`, and `EntryStrategy` types.
2. Keep the optimizer result shape compatible with the existing manifest code in `src/q-manifest.ts`, especially `segment.name`, `segment.origin`, and symbol mapping data.
3. Preserve virtual module ids and `resolveId` behavior so Rolldown does not hand Qwik segments to normal filesystem or package resolution.
4. Keep manifest creation and injection outside the optimizer rewrite unless the manifest schema itself changes.
5. Update `src/rolldown.test.ts` mocks before changing production code so the adapter contract stays explicit.
6. Run `pnpm test` and `pnpm build`, then run fixture builds after changing optimizer output behavior.

### Rolldown and Vite Notes

- Prefer Rolldown hook filters only when the filter and the existing in-hook guard can stay in sync. The current `SOURCE_RE` guard is still the source of truth for optimizer input.
- Rolldown output generation can run per output configuration, so plugin state should stay scoped by root and environment rather than assuming one Rollup-style build pass.
- The Vite plugin in `src/vite.ts` delegates to the Rolldown plugin. Optimizer rewrite work should start in the Rolldown adapter and only add Vite-specific handling when dev-server behavior requires it.
- Vite custom HMR currently lives in the small bridge plugin returned by `qwik-bundler/vite`; avoid coupling optimizer initialization to that bridge.

### Useful Files

- `src/rolldown.ts`: optimizer calls, Qwik segment virtual modules, output defaults, and manifest emission.
- `src/vite.ts`: Vite wrapper around the Rolldown plugin and Qwik HMR bridge.
- `src/q-manifest.ts`: manifest shape, symbol mapping, bundle graph, and server manifest injection.
- `src/rolldown.test.ts`: optimizer contract tests and mocks.
- `fixtures/README.md`: fixture build workflow for manual QA.
