# Fixtures

These fixtures are small QA targets for the host-native plugins.

They intentionally use host config for entries, output, server adapters, router plugins, and library mode. The Qwik plugin only appears as `qwik()` from `qwik-bundler/rolldown` or `qwik-bundler/vite`.

Run the package build first so workspace consumers resolve the current plugin output:

```sh
pnpm build
```

Then run an individual fixture from its directory, for example:

```sh
pnpm --dir fixtures/rolldown-library build
```
