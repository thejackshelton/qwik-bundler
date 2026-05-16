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
	start: number;
	end: number;
}

export function makeConstPropsDiffable(code: string, parse: Parse) {
	const importSpecifier = findJsxSortedImport(parse(code) as Program);
	if (!importSpecifier) {
		return code;
	}

	const { declaration, specifier } = importSpecifier;
	const moduleSource = code.slice(declaration.source.start, declaration.source.end);
	const before = code.slice(0, specifier.start);
	const after = code.slice(specifier.end);
	return `${before}${jsxSplitSpecifier()}${after}\n${jsxSortedHmrShim(moduleSource)}`;
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

function jsxSortedHmrShim(moduleSource: string) {
	return (
		'const _jsxSorted=(type,varProps,constProps,children,flags,key,dev)=>' +
		'__qwikHmrJsxSplit(type,{...constProps,...varProps},null,children,flags,key??(dev&&((s)=>s?`${dev.fileName}:${dev.lineNumber}:${dev.columnNumber}:${s}`:null)(Array.isArray(children)?children.filter((c)=>typeof c==="string").join("|"):typeof children==="string"?children:"")),dev);'
	);
}
