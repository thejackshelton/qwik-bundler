# Qwik Bundler

Small Rolldown/Vite harness for trying the TypeScript Qwik optimizer rewrite in real apps.

## Where to Integrate

Start in `src/rolldown.ts`. The current plugin lazily creates the optimizer, then calls `transformModules` from the Rolldown `transform` hook.

Replace that optimizer boundary with the TypeScript optimizer, but keep the adapter contract simple:

- accept TS/JSX input directly because Rolldown lowers TS/JSX after plugin transforms
- keep the existing client/server/lib entry strategies
- return the same segment data used by `src/q-manifest.ts`
- keep Qwik segment virtual module ids as `\0qwik:segment:<environment>:<path>`
- keep manifest creation/injection in this repo unless the manifest schema changes

## Rolldown AST Access

Rolldown already exposes an OXC parser AST inside `transform`:

```ts
transform(code, id, meta) {
	const ast = meta.ast;
}
```

`meta.ast` is a lazy `@oxc-project/types` `Program` for the current module. Rolldown creates it with the module type, so TS/TSX files get a TS-capable AST. This is the right place to try reusing Rolldown's parser once the optimizer works with its own parser path.

Other options exist, but use them later:

- `this.parse(code, options)` parses through Rolldown's internal parser from a plugin context.
- `parseAst` from `rolldown/parseAst` parses code outside a plugin hook.
- `moduleParsed` gives `ModuleInfo`, not the AST, so it is not the first place to wire optimizer transforms.

## Running A Fixture

Build the package first so fixtures resolve the local plugin output:

```sh
pnpm build
```

Then run a fixture, for example `rolldown-h3`:

```sh
pnpm --dir fixtures/rolldown-h3 build
pnpm --dir fixtures/rolldown-h3 start
```

Open the printed local URL and check that Qwik interactivity still works.

## TypeScript Optimizer (Experimental)

The plugin can run against either the SWC napi optimizer (`@qwik.dev/optimizer`, default) or the TypeScript optimizer rewrite (`qwik-optimizer-ts`). The selection lives behind an experimental feature flag:

```ts
import { qwik } from 'qwik-bundler/rolldown';

export default {
	plugins: [qwik({ experimental: ['tsOptimizer'] })],
};
```

Install `qwik-optimizer-ts` separately when opting in — it isn't published yet, so for local development link the in-progress repo:

```sh
pnpm add -D qwik-optimizer-ts@file:../TS-Optimizer
```

When `tsOptimizer` is in `experimental`, Rolldown's `meta.ast` (the host's pre-parsed OXC `Program`) is forwarded into the optimizer's `TransformModuleInput.program` field. The TS optimizer detects it and skips its internal parse — one parse per module instead of two. SWC ignores the field and re-parses internally, so the threading is a no-op for the default backend.

Behaviour is bit-identical to current `main` when `tsOptimizer` is absent from `experimental`.

## Useful Files

- `src/rolldown.ts`: optimizer adapter, segment modules, output defaults, manifest emission
- `src/q-manifest.ts`: manifest shape and symbol mapping
- `src/vite.ts`: Vite wrapper around the Rolldown plugin
- `src/rolldown.test.ts`: optimizer contract tests/mocks
- `fixtures/`: real app smoke tests
