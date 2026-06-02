// TODO: Put this in the Qwik optimizer directly.

import type { TransformModulesOptions } from '@qwik.dev/optimizer';
import type { QwikEnvironment, QwikOptimizerStripNames } from '../types.ts';

type Parse = (input: string) => unknown;

const SERVER_OUTPUT_REG_CTX_NAME = ['server'];
const SERVER_OUTPUT_STRIP_CTX_NAME = [
	'useClient',
	'useBrowser',
	'useVisibleTask',
	'client',
	'browser',
];
const CLIENT_OUTPUT_STRIP_CTX_NAME = ['useServer', 'server'];

interface Program {
	body?: Node[];
}

interface Node {
	type?: string;
	specifiers?: ImportSpecifier[];
	source?: { start: number; end: number };
}

interface ImportSpecifier {
	type?: string;
	imported?: { name?: string };
	local?: { name?: string };
	start: number;
	end: number;
}

export function applyOptimizerStripNames(
	options: TransformModulesOptions,
	environment: QwikEnvironment,
	extra: QwikOptimizerStripNames,
) {
	if (environment === 'server') {
		options.stripCtxName = unique(SERVER_OUTPUT_STRIP_CTX_NAME, extra.server?.ctxName);
		options.stripEventHandlers = true;
		options.regCtxName = SERVER_OUTPUT_REG_CTX_NAME;
	} else if (environment === 'client') {
		options.stripCtxName = unique(CLIENT_OUTPUT_STRIP_CTX_NAME, extra.client?.ctxName);
		const stripExports = unique(undefined, extra.client?.exports);
		if (stripExports.length) {
			options.stripExports = stripExports;
		}
	}
}

export function mergeOptimizerStripNames(
	target: QwikOptimizerStripNames,
	next: QwikOptimizerStripNames | undefined,
) {
	if (!next) return;
	target.client ??= {};
	target.server ??= {};
	target.client.ctxName = unique(target.client.ctxName, next.client?.ctxName);
	target.client.exports = unique(target.client.exports, next.client?.exports);
	target.server.ctxName = unique(target.server.ctxName, next.server?.ctxName);
}

// TODO: Remove once Qwik core stops producing this Terser-shaped prod output and
// Rolldown owns the annotation handling directly.
export function fixPureAnnotations(code: string): string {
	return code
		.replace(/\/\*\s*[#@]__PURE__\s*\*\/\s*return\s+/g, 'return /* @__PURE__ */ ')
		.replace(/\/\*\s*[#@]__PURE__\s*\*\/(\s*)(?=[^\sA-Za-z_$(])/g, '$1');
}

export function makeConstPropsDiffable(code: string, parse: Parse) {
	const importSpecifier = findJsxSortedImport(parse(code) as Program);
	if (!importSpecifier) {
		return code;
	}

	const { specifier } = importSpecifier;
	const before = code.slice(0, specifier.start);
	const after = code.slice(specifier.end);
	return `${before}${jsxSplitSpecifier()}${after}\n${jsxSortedHmrShim()}`;
}

function findJsxSortedImport(program: Program) {
	for (const node of program.body ?? []) {
		if (node.type !== 'ImportDeclaration') continue;
		const specifier = node.specifiers?.find(isJsxSortedSpecifier);
		if (!specifier || !node.source) continue;
		return {
			declaration: node as Node & { source: { start: number; end: number } },
			specifier,
		};
	}
}

function isJsxSortedSpecifier(specifier: ImportSpecifier) {
	return (
		specifier.type === 'ImportSpecifier' &&
		specifier.imported?.name === '_jsxSorted' &&
		specifier.local?.name === '_jsxSorted'
	);
}

function jsxSplitSpecifier() {
	return '_jsxSplit as __qwikHmrJsxSplit';
}

function jsxSortedHmrShim() {
	return (
		'const _jsxSorted=(type,varProps,constProps,children,flags,key,dev)=>' +
		'__qwikHmrJsxSplit(type,{...constProps,...varProps},null,children,flags,key??(dev&&((s)=>s?`${dev.fileName}:${dev.lineNumber}:${dev.columnNumber}:${s}`:null)(Array.isArray(children)?children.filter((c)=>typeof c==="string").join("|"):typeof children==="string"?children:"")),dev);'
	);
}

function unique(
	base: readonly string[] | undefined,
	extra: readonly string[] | undefined,
): string[] {
	return [...new Set([...(base ?? []), ...(extra ?? [])])];
}
