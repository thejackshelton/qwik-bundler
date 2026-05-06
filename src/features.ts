import type { InputOptions } from 'rolldown';
import type { QwikEnvironment } from './rolldown';

export const QWIK_BUILD = '@qwik.dev/core/build';

const EXPERIMENTAL_FEATURES = [
	'each',
	'suspense',
	'preventNavigate',
	'valibot',
	'noSPA',
	'enableRequestRewrite',
	'webWorker',
	'insights',
] as const;
const SOURCE_RE = /\.[cm]?[jt]sx?$/;
const QWIK_LIBRARY_SOURCE_RE = /\.qwik\.[cm]?[jt]sx?$/;
const NODE_MODULES_RE = /(?:^|[/\\])node_modules[/\\]/;

type QwikTransformResult = { code: string; map: unknown } | null;

export function defineQwik(input: InputOptions, experimental: string[] = [], dev = false) {
	const define = ((input.transform ??= {}).define ??= {});
	define['globalThis.qDev'] ??= String(dev);
	for (const feature of EXPERIMENTAL_FEATURES) {
		define[`__EXPERIMENTAL__.${feature}`] ??= String(experimental.includes(feature));
	}
	return input;
}

export function prepareQwikTransform(
	code: string,
	id: string,
	environment: QwikEnvironment,
	experimental: string[] = [],
) {
	const path = stripQuery(id);
	const replacement = replaceExperimental(code, environment, experimental);
	const skipped = isSkippedNodeModuleSource(path);
	return {
		code: replacement ?? code,
		path,
		replacement: replacement ? { code: replacement, map: null } : null,
		skipped,
		transform: !skipped && isOptimizableSource(path),
	} satisfies {
		code: string;
		path: string;
		replacement: QwikTransformResult;
		skipped: boolean;
		transform: boolean;
	};
}

export function isQwikBuild(id: string) {
	const path = stripQuery(id);
	return (
		path === QWIK_BUILD ||
		path.endsWith(`/${QWIK_BUILD}`) ||
		/[/\\]@qwik\.dev[/\\]core[/\\]dist[/\\]build[/\\]index(?:\.(?:dev|prod))?\.mjs$/.test(path)
	);
}

export function qwikBuildCode(environment: QwikEnvironment, dev = false) {
	const server = environment === 'server';
	return `globalThis.qDev=${dev};export const isServer=${server};export const isBrowser=${!server};export const isDev=${dev};`;
}

export function qwikOptimizerMode(environment: QwikEnvironment, dev = false) {
	if (environment === 'lib') {
		return 'lib';
	}

	return dev ? 'dev' : 'prod';
}

function replaceExperimental(
	code: string,
	environment: QwikEnvironment,
	experimental: string[] = [],
) {
	if (environment === 'lib' || !code.includes('__EXPERIMENTAL__.')) {
		return null;
	}

	return code.replaceAll(/__EXPERIMENTAL__\.(\w+)/g, (_, feature) =>
		String(experimental.includes(feature)),
	);
}

function isOptimizableSource(path: string) {
	return (
		SOURCE_RE.test(path) && (!NODE_MODULES_RE.test(path) || QWIK_LIBRARY_SOURCE_RE.test(path))
	);
}

function isSkippedNodeModuleSource(path: string) {
	return SOURCE_RE.test(path) && NODE_MODULES_RE.test(path) && !QWIK_LIBRARY_SOURCE_RE.test(path);
}

function stripQuery(id: string) {
	const index = id.search(/[?#]/);
	return index < 0 ? id : id.slice(0, index);
}
