import { describe, expect, test } from 'vitest';
import { qwikClient, qwikLib, qwikServer } from '../src/rolldown';
import { callOutputOptions } from './helpers';

type QwikOutputOptions = {
	codeSplitting?: {
		includeDependenciesRecursively?: boolean;
		groups?: Array<{ name: string }>;
	};
};

describe('Qwik chunking defaults', () => {
	test('uses explicit output defaults for each environment', () => {
		const clientOutput = callOutputOptions(qwikClient(), { dir: 'dist' }) as QwikOutputOptions;
		expect(clientOutput).toMatchObject({
			dir: 'dist',
			entryFileNames: 'build/q-[hash].js',
			chunkFileNames: 'build/q-[hash].js',
			hoistTransitiveImports: false,
			minifyInternalExports: false,
			strictExecutionOrder: true,
		});
		expect(clientOutput.codeSplitting?.groups?.map((group) => group.name)).toEqual([
			'qwik-core',
			'qwik-loader',
			'qwik-preloader',
		]);
		expect(callOutputOptions(qwikServer(), { dir: 'server' })).toMatchObject({
			dir: 'server',
			chunkFileNames: 'q-[hash].js',
			hoistTransitiveImports: false,
		});
		expect(callOutputOptions(qwikLib(), { entryFileNames: '[name].js' })).toEqual({
			entryFileNames: '[name].js',
		});
	});

	test('appends user code splitting groups after Qwik groups', () => {
		const userGroup = { name: 'vendor', test: /vendor/ };
		const output = callOutputOptions(qwikClient(), {
			codeSplitting: { groups: [userGroup] },
		}) as QwikOutputOptions;

		expect(output.codeSplitting?.groups?.map((group) => group.name)).toEqual([
			'qwik-core',
			'qwik-loader',
			'qwik-preloader',
			'vendor',
		]);
		expect(output.codeSplitting?.groups?.at(-1)).toBe(userGroup);
	});

	test('rejects boolean code splitting for client builds', () => {
		expect(() => callOutputOptions(qwikClient(), { codeSplitting: true })).toThrow(
			'Qwik requires output.codeSplitting to be an object',
		);
	});
});
