// TODO: Put this in the Qwik optimizer directly.

type Parse = (input: string) => unknown;

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
}

export function makeConstPropsDiffable(code: string, parse: Parse) {
	const importDeclaration = findJsxSortedImport(parse(code) as Program);
	if (!importDeclaration?.source) {
		return code;
	}

	const moduleSource = code.slice(importDeclaration.source.start, importDeclaration.source.end);
	const beforeImport = code.slice(0, importDeclaration.start);
	const afterImport = code.slice(importDeclaration.end);
	return `${beforeImport}${jsxSortedHmrShim(moduleSource)}${afterImport}`;
}

function findJsxSortedImport(program: Program) {
	for (const node of program.body ?? []) {
		if (node.type !== 'ImportDeclaration') continue;
		if (!node.specifiers?.some(isJsxSortedSpecifier)) continue;
		return node as Node & { start: number; end: number };
	}
}

function isJsxSortedSpecifier(specifier: ImportSpecifier) {
	return (
		specifier.type === 'ImportSpecifier' &&
		specifier.imported?.name === '_jsxSorted' &&
		specifier.local?.name === '_jsxSorted'
	);
}

function jsxSortedHmrShim(moduleSource: string) {
	return (
		`import { _jsxSplit as __qwikHmrJsxSplit } from ${moduleSource};\n` +
		'const _jsxSorted=(type,varProps,constProps,children,flags,key,dev)=>' +
		'__qwikHmrJsxSplit(type,{...constProps,...varProps},null,children,flags,key,dev);'
	);
}
