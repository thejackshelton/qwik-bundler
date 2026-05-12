import type { EnvironmentOptions, Plugin as VitePlugin, ResolvedConfig, UserConfig } from 'vite';
import { vi } from 'vitest';

type FunctionHook = (this: unknown, ...args: unknown[]) => unknown;
type PluginHooks = {
	buildApp?: unknown;
	buildStart?: unknown;
	config?: unknown;
	configEnvironment?: unknown;
	configResolved?: unknown;
	configureServer?: unknown;
	generateBundle?: unknown;
	hotUpdate?: unknown;
	load?: unknown;
	options?: unknown;
	outputOptions?: unknown;
	resolveId?: unknown;
	transform?: unknown;
	transformIndexHtml?: unknown;
};
type MockFn = ReturnType<typeof vi.fn>;

export type HookContext = {
	emitFile?: MockFn;
	error?: MockFn;
	resolve?: MockFn;
	warn?: MockFn;
	[key: string]: unknown;
};

export function getPlugin<T extends { name?: string }>(plugins: T[], name: string) {
	const plugin = plugins.find((item) => item.name === name);
	if (!plugin) {
		throw new Error(`Expected ${name} plugin`);
	}
	return plugin;
}

export function callOptions(plugin: PluginHooks, options: unknown) {
	return getHook(plugin.options, 'options').call({}, options);
}

export function callOutputOptions(
	plugin: PluginHooks,
	outputOptions: unknown,
	context: HookContext = {},
) {
	return getHook(plugin.outputOptions, 'outputOptions').call(context, outputOptions);
}

export function callBuildStart(
	plugin: PluginHooks,
	options: { cwd: string },
	context: HookContext = {},
) {
	return getHook(plugin.buildStart, 'buildStart').call(
		{ emitFile: vi.fn(), ...context },
		options,
	);
}

export function callBuildApp(plugin: PluginHooks, builder: unknown) {
	return getHook(plugin.buildApp, 'buildApp').call({}, builder);
}

export function callTransform(
	plugin: PluginHooks,
	code: string,
	id: string,
	context: HookContext = {},
) {
	return getHook(plugin.transform, 'transform').call(
		{
			emitFile: vi.fn(),
			error: vi.fn(),
			parse: vi.fn(parseImports),
			warn: vi.fn(),
			...context,
		},
		code,
		id,
		undefined,
	);
}

function parseImports(code: string) {
	const body = [
		...code.matchAll(/(?:import|export)\s+(?:[^'";]+\s+from\s+)?['"]([^'"]+)['"]/g),
	].map((match) => ({
		type: match[0].startsWith('import') ? 'ImportDeclaration' : 'ExportNamedDeclaration',
		source: { value: match[1] },
	}));
	return { body };
}

export function callResolveId(
	plugin: PluginHooks,
	source: string,
	importer?: string,
	context: HookContext = {},
) {
	return getHook(plugin.resolveId, 'resolveId').call(
		{
			emitFile: vi.fn(),
			error: vi.fn((value: unknown) => {
				throw value instanceof Error ? value : new Error(String(value));
			}),
			resolve: vi.fn(),
			...context,
		},
		source,
		importer,
		{ isEntry: false },
	);
}

export function callLoad(plugin: PluginHooks, id: string, context: HookContext = {}) {
	return getHook(plugin.load, 'load').call(context, id, undefined);
}

export function callGenerateBundle(plugin: PluginHooks, bundle: unknown, emitFile = vi.fn()) {
	return getHook(plugin.generateBundle, 'generateBundle').call({ emitFile }, {}, bundle, false);
}

export function callConfig(
	plugin: Pick<VitePlugin, 'config'>,
	config: UserConfig,
	env: { command: 'build' | 'serve'; mode: string },
) {
	return getHook(plugin.config, 'config').call({}, config, env);
}

export function callConfigEnvironment(
	plugin: Pick<VitePlugin, 'configEnvironment'>,
	name: string,
	config: EnvironmentOptions,
) {
	return getHook(plugin.configEnvironment, 'configEnvironment').call({}, name, config, {});
}

export function callConfigResolved(plugin: Pick<VitePlugin, 'configResolved'>, config: unknown) {
	return getHook(plugin.configResolved, 'configResolved').call({}, config as ResolvedConfig);
}

export function callConfigureServer(plugin: PluginHooks, server: unknown) {
	return getHook(plugin.configureServer, 'configureServer').call({}, server);
}

export function callTransformIndexHtml(plugin: PluginHooks, html: string, context?: unknown) {
	return getHook(plugin.transformIndexHtml, 'transformIndexHtml').call({}, html, context);
}

export function callHotUpdate(plugin: PluginHooks, ctx: unknown, context: HookContext = {}) {
	return getHook(plugin.hotUpdate, 'hotUpdate').call(context, ctx);
}

export function createViteHookContext(
	consumer: 'client' | 'server' = 'client',
	build: { lib?: unknown } = {},
): HookContext {
	return {
		environment: { config: { consumer, build } },
		emitFile: vi.fn(),
		resolve: vi.fn(),
	};
}

function getHook(value: unknown, name: string): FunctionHook {
	if (typeof value === 'function') {
		return value as FunctionHook;
	}
	if (value && typeof value === 'object' && 'handler' in value) {
		const handler = (value as { handler?: unknown }).handler;
		if (typeof handler === 'function') {
			return handler as FunctionHook;
		}
	}
	throw new Error(`Expected function ${name} hook`);
}
