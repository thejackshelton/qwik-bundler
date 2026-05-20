import {
	createFetchableDevEnvironment,
	createServerHotChannel,
	createServerModuleRunner,
} from 'vite';
import type { EnvironmentOptions } from 'vite';
import type {
	DevSsrEntry,
	RequestHandlerModule,
	RouterDevRequestOptions,
	RouterServerRequestEvent,
} from '../types.ts';

type CreateDevEnvironment = NonNullable<
	NonNullable<EnvironmentOptions['dev']>['createEnvironment']
>;

export function createRouterDevEnvironment(options: RouterDevRequestOptions): CreateDevEnvironment {
	return (name, config) => {
		let runner: ReturnType<typeof createServerModuleRunner> | undefined;
		const environment = createFetchableDevEnvironment(name, config, {
			hot: true,
			transport: createServerHotChannel(),
			handleRequest(request) {
				runner ??= createServerModuleRunner(environment);
				return renderDevRequest(runner, request, options);
			},
		});
		const close = environment.close.bind(environment);
		environment.close = async () => {
			await runner?.close();
			await close();
		};
		return environment;
	};
}

async function renderDevRequest(
	runner: ReturnType<typeof createServerModuleRunner>,
	request: Request,
	options: RouterDevRequestOptions,
) {
	(globalThis as { __qwik?: unknown }).__qwik = undefined;
	const [entry, requestHandler] = await Promise.all([
		runner.import<DevSsrEntry>('src/entry.ssr'),
		runner.import<RequestHandlerModule>('@qwik.dev/router/middleware/request-handler'),
	]);
	if (typeof entry.default !== 'function') {
		return new Response('src/entry.ssr must export a default renderer', { status: 500 });
	}

	const handled = await requestHandler.requestHandler(
		createServerRequestEvent(request, requestHandler, options),
		{
			render: entry.default,
		},
	);
	if (!handled) {
		return new Response('Not Found', { status: 404 });
	}
	void handled.completion.then(logCompletionError, logCompletionError);
	const response = await handled.response;
	return response ?? new Response('Not Found', { status: 404 });
}

function logCompletionError(error: unknown) {
	if (error) {
		console.error(error);
	}
}

function createServerRequestEvent(
	request: Request,
	requestHandler: RequestHandlerModule,
	options: RouterDevRequestOptions,
): RouterServerRequestEvent<Response> {
	const url = new URL(request.url);
	return {
		mode: 'server',
		locale: undefined,
		url,
		request,
		env: {
			get(key) {
				return getPlatformEnvValue(options.platform, key);
			},
		},
		getWritableStream: (status, headers, cookies, resolve) => {
			const { readable, writable } = new TransformStream<Uint8Array>();
			resolve(
				new Response(readable, {
					status,
					headers: requestHandler.mergeHeadersCookies(headers, cookies),
				}),
			);
			return writable;
		},
		getClientConn: () => ({}),
		platform: {
			ssr: true,
			request,
			...options.platform,
		},
	};
}

function getPlatformEnvValue(platform: Record<string, unknown> | undefined, key: string) {
	const env = platform?.env;
	if (env && typeof env === 'object' && 'get' in env && typeof env.get === 'function') {
		return env.get(key);
	}
	const value = platform?.[key];
	if (typeof value !== 'string') {
		return undefined;
	}
	return value;
}
