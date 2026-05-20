import { isFetchableDevEnvironment } from 'vite';
import type { Environment, FetchableDevEnvironment, ViteDevServer } from 'vite';
import type { QwikEnvironment } from '../types.ts';

type ViteEnvironmentConfig = {
	consumer?: string;
	build?: { lib?: unknown };
};

type ViteEnvironmentLike = {
	name?: string;
	config?: ViteEnvironmentConfig;
};

export interface QwikViteEnvironmentOptions {
	clientEnvironment?: string;
	serverEnvironment?: string;
}

export function viteEnvironmentName(
	environment: QwikEnvironment,
	options: QwikViteEnvironmentOptions = {},
) {
	if (environment === 'client') {
		return options.clientEnvironment ?? 'client';
	}
	if (environment === 'server') {
		return options.serverEnvironment ?? 'ssr';
	}
	return environment;
}

export function qwikEnvironment(environment: ViteEnvironmentLike | undefined) {
	const config = environment?.config;
	if (!config) {
		return 'client';
	}

	if (config.build?.lib) {
		return 'lib';
	}

	if (isServerViteEnvironment(environment)) {
		return 'server';
	}

	return 'client';
}

export function isServerViteEnvironment(environment: ViteEnvironmentLike | undefined) {
	const consumer = environment?.config?.consumer;
	if (consumer) {
		return consumer === 'server';
	}

	return environment?.name !== undefined && environment.name !== 'client';
}

export function transformQwikRequest(
	server: Pick<ViteDevServer, 'environments'>,
	url: string,
	environment: QwikEnvironment,
	options?: QwikViteEnvironmentOptions,
) {
	return server.environments[viteEnvironmentName(environment, options)]?.transformRequest(url);
}

export function fetchableDevEnvironment(
	environment: Environment | undefined,
): FetchableDevEnvironment | undefined {
	if (!environment) {
		return undefined;
	}
	if (isFetchableDevEnvironment(environment)) {
		return environment;
	}

	// Keep lightweight test environments and Vite-compatible custom environments usable.
	const maybeFetchable = environment as Partial<FetchableDevEnvironment>;
	return typeof maybeFetchable.dispatchFetch === 'function'
		? (environment as FetchableDevEnvironment)
		: undefined;
}
