import type { InputOptions } from 'rolldown';
import type { QwikEnvironment } from './rolldown';

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

export function defineQwik(input: InputOptions, experimental: string[] = [], dev = false) {
	const define = ((input.transform ??= {}).define ??= {});
	define['globalThis.qDev'] ??= String(dev);
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
