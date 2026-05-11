# Contributing

## What The Qwik Manifest Is

Qwik splits application code into many small browser chunks. Server-rendered HTML does not directly contain all of the JavaScript needed for every interactive component. Instead, the HTML contains Qwik markers that tell the browser which symbol to load later when the user interacts with the page.

The Qwik manifest is the lookup table for those markers.

For example, after the browser sees a click handler marker, Qwik needs to answer questions like:

- Which browser chunk contains this handler?
- What URL should be imported for that chunk?
- Which Qwik runtime chunk should be preloaded?
- Which bundle graph file describes reachable chunks?

Those answers are only known after the client bundle is built, because the bundler decides final chunk names such as `build/q-BYduuXnN.js`.

So the important rule is:

```text
Build Qwik client chunks -> create manifest -> run SSR/SSG rendering
```

`q-manifest.json` is one file representation of this data, but the JSON file is not the important part. The important part is the manifest data produced by the client build.

## Why Build Order Matters

Production SSR and SSG need the manifest while rendering HTML. If rendering happens before the client build, Qwik cannot know the final browser chunk URLs yet.

This breaks pages in two common ways:

- SSR/SSG HTML may reference missing chunks.
- Browser interactivity may fail because dynamic imports return 404s.

Patching server output after the fact is not enough for SSG if static HTML has already been rendered. The hard barrier is not necessarily "before every server bundle build"; it is "before Qwik SSR/SSG render execution".

## Vite Environment Strategy

For Vite builder builds, the Qwik Vite plugin owns this invariant through plugin ordering:

```text
adapter environment setup -> canonical client build -> Qwik client manifest -> server/worker/SSG render
```

The Vite plugin uses `enforce: 'post'` and a `buildApp` hook with `order: 'pre'`.

`enforce: 'post'` lets adapter and framework plugins such as Nitro or Cloudflare configure Vite environments, entries, and output directories before Qwik decides what to build. `buildApp.order: 'pre'` then builds the canonical client environment early in the Vite builder phase, before server, worker, or prerender code needs `globalThis.__QWIK_MANIFEST__`.

This ordering is intentional. Running Qwik earlier can race adapter environment setup. Running Qwik later can make the initial server or worker build execute without a client manifest.

The plugin does not build every environment with `consumer === 'client'`. Auxiliary client-like environments may exist, and adapters should own those build steps.

Some adapters still call `builder.build(client)` from their own build orchestration after Qwik has already prebuilt the canonical client environment. Cloudflare's Vite plugin does this: it builds workers, then builds the client again so imported assets can be moved into the client output. Qwik keeps that adapter flow intact, but skips the duplicate client build if the canonical client environment is already built. This preserves adapter behavior without wasting a second identical client build.

The plugin does not guess application entries such as `src/root.tsx`, `src/entry.ssr.tsx`, or router-specific files. The app or adapter still owns entries and framework conventions. Plain Vite apps may use Vite's normal client defaults such as `index.html`; framework adapters that need non-standard entries should configure the canonical `client` environment before Qwik's `buildApp` hook runs.

## Runtime Chunk Requirements

Qwik's browser runtime imports exact export names from manifest-mapped chunks. These names are part of Qwik's runtime contract, not arbitrary implementation details.

Important examples:

- The preloader chunk must export `g`, `l`, and `p`.
- The handlers chunk must export names such as `_run`, `_chk`, `_task`, and `_val`.

If Rolldown merges these modules into a larger chunk and rewrites the public exports, the browser can fail with errors such as `l is not a function`, `p is not a function`, or `_run not in ...`.

The plugin avoids that by emitting small client runtime facade chunks for the preloader and handlers. Those facades preserve the export names Qwik imports while allowing the larger core/preloader implementation chunks to remain optimized behind them.

Client output defaults are also client-only. Browser chunks should be emitted under `build/q-[hash].js` so manifest paths, static HTML preload paths, and Qwik runtime dynamic imports all agree. Do not apply those client output defaults globally; server and worker environments may inherit top-level Vite build settings, and client-only chunk splitting options can be invalid for those builds.

## Adapter Expectations

Adapters should provide normal Vite client configuration and public asset paths. They should not pass a Qwik-specific client environment option or manually run a separate Qwik client build.

Adapters that prerender during Vite build should run prerendering from `buildApp` only after Qwik's client manifest exists.

Adapters may still own framework-specific entry discovery. If they synthesize client entries, those entries must be present in the canonical Vite client configuration before Qwik SSR/SSG render execution.

Some frameworks discover client inputs dynamically during a server/prerender analysis build. Astro is the important example: hydrated/client-only inputs may be discovered during SSR/prerender analysis, then Astro mutates the canonical client input, builds the client bundle, and only then generates final pages. That model is compatible with Qwik only if the framework provides a pre-render barrier where the canonical client build can run and produce the Qwik manifest before HTML is rendered.

Nitro is different. Nitro's documented Vite examples require explicit canonical `client` and `ssr` inputs. Nitro's `?assets=client` imports are asset references for a configured client build; they are not a replacement for the top-level client input. Qwik + Nitro SSR fixtures should declare `environments.client.build.rollupOptions.input` until Nitro reads `rolldownOptions.input` at the same point.

## Do Not

- Do not coordinate server rendering by reading `q-manifest.json` from disk at runtime.
- Do not patch server chunks after SSG has already rendered.
- Do not build every Vite environment with `consumer === 'client'`; unrelated client environments may exist.
- Do not add app/router defaults such as `src/root.tsx` in the core bundler plugin.
- Do not use a private `qwik_client` environment as the primary manifest producer; adapters commonly key browser assets from the canonical `client` environment.
- Do not apply Qwik client output defaults to top-level Vite build config; scope them to the actual client environment.
- Do not let Qwik runtime handler or preloader exports be renamed away from the names the browser loader imports.
- Do not remove the duplicate-client-build skip without checking Workerd/Cloudflare; their build app may ask Vite to build `client` again after Qwik's manifest prebuild.

## Verification Fixtures

- `fixtures/vite-workerd` verifies a server/worker-first adapter receives Qwik client assets before worker output uses the manifest, and that the adapter does not rebuild the client after Qwik's prebuild.
- `fixtures/vite-ssg` verifies a post-`buildApp` prerender step sees `client` already built and renders HTML with Qwik manifest/preload assets.
- `fixtures/vite-nitro-v3` verifies Nitro works when the app follows Nitro's documented canonical client-input contract, including dev/HMR bridge injection and production `/build/q-[hash].js` runtime paths.
