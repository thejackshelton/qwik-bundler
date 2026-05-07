interface NitroAssetAttributes {
	[key: string]: boolean | string | undefined;
}

interface NitroAssets {
	css: NitroAssetAttributes[];
	entry?: string;
	js: NitroAssetAttributes[];
	merge: (other: NitroAssets) => NitroAssets;
}

declare module '*?assets=client' {
	const assets: NitroAssets;
	export default assets;
}

declare module '*?assets=ssr' {
	const assets: NitroAssets;
	export default assets;
}
