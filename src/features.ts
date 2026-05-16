import type { InputOptions } from 'rolldown';
import type { QwikEnvironment } from './types.ts';

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

export function comptimeConfig(input: InputOptions, experimental: string[] = [], dev = false) {
	const define = ((input.transform ??= {}).define ??= {});
	define['import.meta.env.BASE_URL'] ??= "'/'";
	define['import.meta.env.DEV'] ??= String(dev);
	define['import.meta.env.MODE'] ??= dev ? "'development'" : "'production'";
	define['import.meta.env.TEST'] ??= 'false';
	define['globalThis.qDev'] ??= String(dev);
	define['globalThis.qInspector'] ??= String(dev);
	for (const feature of EXPERIMENTAL_FEATURES) {
		define[`__EXPERIMENTAL__.${feature}`] ??= String(experimental.includes(feature));
	}
	return input;
}

export function replaceExperimental(
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
