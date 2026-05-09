# Testing Patterns

**Analysis Date:** 2026-05-09

## Test Framework

**Runner:**

- Vitest `^4.0.18` from `package.json`.
- Config: `vite.config.ts` uses `test.environment: 'node'` and `test.include: ['test/**/*.test.ts']`.

**Assertion Library:**

- Vitest `expect` from `vitest`, used throughout `test/chunking.test.ts`, `test/manifest.test.ts`, `test/vite-config.test.ts`, and `test/rolldown-runtime.test.ts`.

**Run Commands:**

```bash
pnpm test              # Run all tests through vp test
pnpm test:watch        # Watch mode through vp test watch
pnpm check             # Type/lint/format verification through vp check
```

## Test File Organization

**Location:**

- Tests are centralized under `test/`; source files in `src/` do not have co-located tests.
- Test helpers live in `test/helpers.ts` and are shared by feature tests.
- Fixtures live under `fixtures/` and are consumed by integration-style tests such as `test/qwik-external.test.ts`.

**Naming:**

- Use `<feature>.test.ts`: `test/rolldown-transform.test.ts`, `test/rolldown-runtime.test.ts`, `test/vite-plugin.test.ts`, `test/static-html.test.ts`.
- Name tests by observable behavior: `test('uses server optimizer settings for qwikServer()', ...)` in `test/rolldown-transform.test.ts`, `test('injects Qwik preloader bootstrap into generated HTML assets', ...)` in `test/static-html.test.ts`.

**Structure:**

```
test/
├── helpers.ts                  # Hook invocation utilities and mock contexts
├── chunking.test.ts            # Output defaults and code-splitting behavior
├── manifest.test.ts            # Manifest creation and injection behavior
├── qwik-external.test.ts       # External resolution plus fixture build check
├── rolldown-runtime.test.ts    # Runtime module, dev segment, and QRL resolution behavior
├── rolldown-transform.test.ts  # Optimizer transform behavior
├── static-html.test.ts         # Static HTML preloader injection behavior
├── vite-config.test.ts         # Vite config and vitefu integration behavior
└── vite-plugin.test.ts         # Vite plugin identity and hook behavior
```

## Test Structure

**Suite Organization:**

```typescript
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { qwikClient } from '../src/rolldown';
import { callBuildStart, callTransform } from './helpers';

const optimizerMock = vi.hoisted(() => ({
	createOptimizer: vi.fn(),
	transformModules: vi.fn(),
}));

vi.mock('@qwik.dev/optimizer', () => ({
	createOptimizer: optimizerMock.createOptimizer,
}));

beforeEach(() => {
	optimizerMock.createOptimizer.mockReset();
	optimizerMock.transformModules.mockReset();
});

describe('Rolldown optimizer transforms', () => {
	test('defaults qwik() to the client plugin', async () => {
		const plugin = qwikClient();
		callBuildStart(plugin, { cwd: '/workspace/app' });
		const result = await callTransform(
			plugin,
			'export default 1;',
			'/workspace/app/src/root.tsx',
		);
		expect(result).toEqual({ code: 'optimized', map: null });
	});
});
```

**Patterns:**

- Group related behavior with `describe(...)` for broad areas: `test/rolldown-transform.test.ts`, `test/rolldown-runtime.test.ts`, `test/vite-config.test.ts`.
- Use top-level `test(...)` without `describe(...)` for small focused integration files: `test/qwik-external.test.ts`.
- Use `beforeEach` to reset hoisted mocks and define default async mock behavior: `test/rolldown-transform.test.ts`, `test/vite-plugin.test.ts`, `test/manifest.test.ts`.
- Prefer asserting complete hook outputs with `toEqual` or `toMatchObject`: `test/chunking.test.ts`, `test/vite-config.test.ts`, `test/vite-plugin.test.ts`.
- Use guard checks before inspecting union return types: `test/manifest.test.ts` checks `result` has `code` before assertions.

## Mocking

**Framework:** Vitest `vi`.

**Patterns:**

```typescript
const optimizerMock = vi.hoisted(() => ({
	createOptimizer: vi.fn(),
	transformModules: vi.fn(),
}));

vi.mock('@qwik.dev/optimizer', () => ({
	createOptimizer: optimizerMock.createOptimizer,
}));

beforeEach(() => {
	optimizerMock.createOptimizer.mockReset();
	optimizerMock.transformModules.mockReset();
	optimizerMock.transformModules.mockResolvedValue({
		modules: [
			{
				path: './src/root.tsx',
				isEntry: false,
				code: 'optimized',
				map: null,
				segment: null,
				origPath: null,
			},
		],
		diagnostics: [],
		isTypeScript: true,
		isJsx: true,
	});
});
```

**What to Mock:**

- Mock expensive or external package APIs at module boundaries: `@qwik.dev/optimizer` in `test/rolldown-transform.test.ts`, `test/rolldown-runtime.test.ts`, `test/vite-plugin.test.ts`, and `test/manifest.test.ts`.
- Mock `vitefu` crawling for Vite config tests: `vi.mock('vitefu', ...)` in `test/vite-config.test.ts`.
- Mock plugin hook context functions with `vi.fn()`: `emitFile`, `resolve`, `warn`, and `error` in `test/helpers.ts`.
- Mock dev server callbacks narrowly: `transformRequest` in `test/rolldown-runtime.test.ts`.

**What NOT to Mock:**

- Do not mock the plugin under test; instantiate `qwikClient`, `qwikServer`, `qwikLib`, or `qwik` from `src/rolldown.ts` and `src/vite.ts`.
- Do not mock the fixture build path when behavior depends on real Rolldown output; `test/qwik-external.test.ts` calls `build` from `rolldown` against `fixtures/rolldown-library-consumer`.
- Do not mock shared test helpers; keep hook behavior centralized in `test/helpers.ts`.

## Fixtures and Factories

**Test Data:**

```typescript
function staticHtmlBundle(
	source = '<html><head><title>App</title><script type="module" src="/build/q-entry.js"></script></head><body><div id="root"></div></body></html>',
) {
	return {
		'index.html': {
			type: 'asset',
			fileName: 'index.html',
			name: 'index.html',
			names: ['index.html'],
			source,
		},
		'build/q-entry.js': {
			type: 'chunk',
			fileName: 'build/q-entry.js',
			imports: [],
			dynamicImports: ['build/q-root.js'],
		},
	} as const;
}
```

**Location:**

- Inline factories live in the test that owns them: `staticHtmlBundle` in `test/static-html.test.ts`, `getQwikPlugin` in `test/vite-plugin.test.ts` and `test/vite-config.test.ts`.
- Shared hook factories and invocation helpers live in `test/helpers.ts`.
- Real package/app fixtures live under `fixtures/`: `fixtures/rolldown-library-consumer`, `fixtures/vite-csr`, `fixtures/vite-nitro-v3`, `fixtures/rolldown-hono`, and `fixtures/rolldown-h3`.

## Coverage

**Requirements:** None enforced in `vite.config.ts` or `package.json`.

**View Coverage:**

```bash
Not configured              # No coverage script is defined in package.json
```

## Test Types

**Unit Tests:**

- Most tests call plugin hooks directly through `test/helpers.ts` without starting dev servers or full builds: `test/chunking.test.ts`, `test/rolldown-transform.test.ts`, `test/vite-plugin.test.ts`, `test/manifest.test.ts`.
- Unit tests assert exact config transformations, returned hook values, diagnostics, and emitted files.

**Integration Tests:**

- Fixture-backed build coverage exists for external handling: `test/qwik-external.test.ts` builds `fixtures/rolldown-library-consumer` with real `rolldown` and inspects generated server output.
- Static HTML tests use realistic generated bundle objects in `test/static-html.test.ts` rather than only testing private helper functions.
- Vite config tests exercise real plugin config hooks and mocked `vitefu` output in `test/vite-config.test.ts`.

**E2E Tests:**

- Not used. No browser, Playwright, Cypress, or full HTTP E2E runner is configured in `package.json` or `vite.config.ts`.

## Common Patterns

**Async Testing:**

```typescript
test('uses Vite config root for optimizer paths', async () => {
	const plugin = getQwikPlugin();
	callConfigResolved(plugin, {
		root: '/workspace/app',
		build: { rolldownOptions: { input: 'src/root.tsx' }, rollupOptions: {} },
	});
	const result = await callTransform(
		plugin,
		'export default 1;',
		'/workspace/app/src/root.tsx',
		createViteHookContext(),
	);
	expect(result).toEqual({ code: 'optimized', map: null });
});
```

**Error Testing:**

```typescript
test('rejects boolean code splitting for client builds', () => {
	expect(() => callOutputOptions(qwikClient(), { codeSplitting: true })).toThrow(
		'Qwik requires output.codeSplitting to be an object',
	);
});
```

**Plugin Context Testing:**

```typescript
const warn = vi.fn();
const error = vi.fn();
await callTransform(plugin, 'export default 1;', '/workspace/app/src/root.tsx', { warn, error });
expect(warn).toHaveBeenCalledTimes(1);
expect(error).toHaveBeenCalledTimes(1);
```

---

_Testing analysis: 2026-05-09_
