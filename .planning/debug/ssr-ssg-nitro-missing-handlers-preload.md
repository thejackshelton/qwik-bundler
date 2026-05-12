---
status: awaiting_human_verify
trigger: '/gsd-debug Investigate and minimally fix SSR/SSG/Nitro missing preload of the Qwik handlers chunk. Evidence: CSR/static HTML has post-build reachable modulepreload tags including handlers, but SSR/SSG render-time preloader only references event symbol chunks; interaction loads the handlers chunk. Focus on manifest/bundle-graph generation. Keep changes minimal and add focused tests. Do not commit.'
goal: find_and_fix
tdd_mode: false
---

# Debug Session: SSR/SSG/Nitro Missing Qwik Handlers Preload

## Current Focus

reasoning_checkpoint:
hypothesis: "Symbol-hash bundle graph nodes only point dynamically at the symbol chunk, so SSR/SSG render-time preloader does not see that the symbol chunk has a static dependency on the Qwik handlers chunk."
confirming_evidence: - "convertManifestToBundleGraph synthesizes graph[symbolHash] as { dynamicImports: [bundleName] } without copying manifest.bundles[bundleName].imports." - "Focused RED test shows graphDeps(graph, 'abc12345') returns only ['q-click.js'] when q-click.js imports q-handlers.js." - "Static CSR HTML has a separate reachablePreloads traversal from entry scripts, explaining why it can discover handlers while SSR/SSG symbol preload cannot."
falsification_test: "If a symbol graph node generated from a symbol chunk with imports: ['q-handlers.js'] already included q-handlers.js as a direct dependency, this hypothesis would be false."
fix_rationale: "Copying the symbol bundle's static imports onto the synthetic symbol hash node makes render-time preload see required static dependencies before it dynamically imports the symbol bundle, without changing bundle output or app conventions."
blind_spots: "The exact Qwik core preloader traversal is not executed here; verification relies on the compact bundle graph contract and focused unit coverage."

- hypothesis: Fixed by carrying symbol bundle static imports into synthetic symbol-hash bundle graph nodes.
- test: Self-verification completed; awaiting human/environment verification of SSR/SSG/Nitro render-time preload output.
- expecting: SSR/SSG/Nitro HTML should now preload the Qwik handlers chunk when an event symbol chunk statically imports it.
- next_action: Ask user to verify the original SSR/SSG/Nitro workflow in the real fixture/app environment.

## Evidence

- timestamp: 2026-05-11T00:00:00Z
  source: user
  details: CSR/static HTML has post-build reachable modulepreload tags including handlers, but SSR/SSG render-time preloader only references event symbol chunks; interaction loads the handlers chunk. Focus should be manifest/bundle-graph generation. Add focused tests. Do not commit.
- timestamp: 2026-05-11T00:00:00Z
  checked: src/build/manifest.ts convertManifestToBundleGraph
  found: Symbol hash graph nodes are synthesized as { dynamicImports: [bundleName] } and do not copy the symbol bundle's static imports.
  implication: A render-time preloader that starts from an event symbol hash can emit the event chunk without seeing static dependencies such as q-handlers.js.
- timestamp: 2026-05-11T00:00:00Z
  checked: src/build/static-html.ts reachablePreloads
  found: Static CSR HTML traverses bundle imports/dynamicImports from the entry script and therefore can discover transitive reachable chunks, independent of symbol-hash graph nodes.
  implication: This explains why CSR/static HTML can include handlers while SSR/SSG render-time preloading misses it.
- timestamp: 2026-05-11T00:00:00Z
  checked: pnpm test test/manifest.test.ts after adding focused regression test
  found: Test failed as expected; graphDeps(graph, 'abc12345') returned ['q-click.js'] and did not include q-handlers.js.
  implication: The bug is reproduced at the manifest/bundle-graph layer before any implementation fix.
- timestamp: 2026-05-11T00:00:00Z
  checked: pnpm test test/manifest.test.ts after implementation fix
  found: All 7 manifest tests passed, including the new regression that requires q-handlers.js on the symbol hash graph node.
  implication: The manifest/bundle-graph bug is fixed for the focused reproduction.
- timestamp: 2026-05-11T00:00:00Z
  checked: pnpm test test/static-html.test.ts
  found: All 5 static HTML tests passed.
  implication: Existing CSR/static HTML preloader behavior remains intact after the manifest fix.
- timestamp: 2026-05-11T00:00:00Z
  checked: pnpm test
  found: Full test suite passed: 10 test files, 83 tests.
  implication: No existing automated tests regressed from the bundle graph change.
- timestamp: 2026-05-11T00:00:00Z
  checked: pnpm check
  found: Full check failed only because existing fixtures/vite-workerd/.wrangler/deploy/config.json has formatting issues; changed debug file was formatted afterward.
  implication: The repository-wide check is blocked by an unrelated generated fixture config.
- timestamp: 2026-05-11T00:00:00Z
  checked: pnpm exec vp check src/build/manifest.ts test/manifest.test.ts .planning/debug/ssr-ssg-nitro-missing-handlers-preload.md
  found: Changed files passed formatting; changed source/test files also passed lint.
  implication: The files modified for this fix are clean under the project checker.

## Investigation Log

## Specialist Review

## Resolution

- root_cause: Synthetic symbol hash nodes in convertManifestToBundleGraph only contained a dynamic edge to the symbol chunk and did not include the symbol chunk's static imports, so SSR/SSG render-time preloading from an event symbol hash missed required static dependencies such as the Qwik handlers chunk.
- fix: convertManifestToBundleGraph now copies a symbol bundle's static imports onto the synthetic symbol-hash graph node while preserving the dynamic edge to the symbol bundle; added a focused manifest regression test.
- verification: Focused manifest regression failed before the fix and passed after it; adjacent static HTML tests passed; full test suite passed; changed files passed checker. Full pnpm check remains blocked by unrelated fixtures/vite-workerd/.wrangler/deploy/config.json formatting.
- cycles_investigation: 0
- cycles_fix: 0
