# MOVE TO ROUTER

These behaviors currently live in the Qwik Vite plugin area, but should move to the Qwik Router Vite integration instead of staying in the generic Qwik bundler/plugin layer.

## Default Client Input

- Behavior: provide the default client input as `src/root.tsx` when the app/router layer has not supplied one.
- Current area: `packages/qwik-vite/src/plugins/plugin.ts`, option normalization around the default `opts.input` selection for client builds.
- Related current area: `packages/qwik-vite/src/plugins/vite.ts`, Vite config hook where client input is selected from `qwikViteOpts.client?.input` and passed into build input.
- Router ownership: router knows the app root convention and should provide this default for router apps.

## Preview Server Configuration

- Behavior: configure the Vite preview server to serve the SSR output.
- Current area: `packages/qwik-vite/src/plugins/vite.ts`, `configurePreviewServer()` hook in the post plugin.
- Related current area: `packages/qwik-vite/src/plugins/dev/index.ts`, `configurePreviewServer()` helper.
- Router ownership: preview SSR serving is app/router behavior, not core Qwik bundling behavior.
