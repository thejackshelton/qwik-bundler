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

For Vite builder builds, the Qwik Vite plugin owns this invariant when the host exposes a canonical client input before render execution:

```text
canonical client build -> Qwik client manifest -> server/SSG render
```

The plugin builds the canonical Vite `client` environment from a `buildApp` hook when that environment has an explicit input. This hook intentionally runs after adapter `order: 'pre'` preparation hooks, so adapters can clean or prepare output directories before the client bundle is written, but before framework `order: 'post'` SSR/prerender hooks. This matches Vite and adapter conventions: public asset handling, asset manifests, and deployment plugins usually key browser output from `builder.environments.client`.

The plugin does not build every environment with `consumer === 'client'`. Auxiliary client-like environments may exist, and adapters should own those build steps. Later attempts to build the canonical `client` environment reuse the prebuild result so the same bundle is not built twice.

The plugin does not guess application entries such as `index.html`, `src/root.tsx`, or router-specific files. If the canonical `client` environment has no explicit `rolldownOptions.input` or `rollupOptions.input`, Qwik skips the prebuild rather than triggering Vite's implicit `index.html` fallback.

## Adapter Expectations

Adapters should provide normal Vite client configuration and public asset paths. They should not pass a Qwik-specific client environment option or manually run a separate Qwik client build.

Adapters that prerender during Vite build should run prerendering from `buildApp` only after Qwik's client manifest exists.

Adapters may still own framework-specific entry discovery. If they synthesize client entries, those entries must be present in the canonical Vite client configuration before Qwik SSR/SSG render execution.

Some frameworks discover client inputs dynamically during a server/prerender analysis build. Astro is the important example: hydrated/client-only inputs are discovered during its SSR/prerender build, then Astro mutates the canonical client input, builds the client bundle, and only then generates final pages. That model is compatible with Qwik only if the framework provides a pre-render barrier where the canonical client build can run and produce the Qwik manifest before HTML is rendered.

Nitro is different. Nitro's documented Vite examples require explicit canonical `client` and `ssr` inputs. Nitro's `?assets=client` imports are asset references for a configured client build; they are not a replacement for the top-level client input. Qwik + Nitro SSR fixtures should declare `environments.client.build.rollupOptions.input` until Nitro reads `rolldownOptions.input` at the same point.

## Do Not

- Do not coordinate server rendering by reading `q-manifest.json` from disk at runtime.
- Do not patch server chunks after SSG has already rendered.
- Do not build every Vite environment with `consumer === 'client'`; unrelated client environments may exist.
- Do not add app/router defaults such as `src/root.tsx` in the core bundler plugin.
- Do not use a private `qwik_client` environment as the primary manifest producer; adapters commonly key browser assets from the canonical `client` environment.

## Verification Fixtures

- `fixtures/vite-workerd` verifies a server/worker-first adapter still receives Qwik client assets before server output uses the manifest.
- `fixtures/vite-ssg` verifies a post-`buildApp` prerender step sees `client` already built and renders HTML with Qwik manifest/preload assets.
- `fixtures/vite-nitro-v3` verifies Nitro works when the app follows Nitro's documented canonical client-input contract.
