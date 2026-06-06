export type ContentHeading = {
	text: string;
	id: string;
	level: number;
};

export type HeadingLinkNode = {
	type: 'element';
	tagName: 'a';
	properties: {
		'aria-hidden': 'true';
		tabindex: -1;
		href: string;
	};
	children: [
		{
			type: 'element';
			tagName: 'span';
			properties: { class: 'icon icon-link' };
			children: [];
		},
	];
};

export const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

const NON_SLUG_CHAR = /[^a-z0-9 -]/g;
const SLUG_SEPARATOR = /[ -]+/g;

export function createHeadingSlugger() {
	const slugs = new Map<string, number>();
	return (text: string) => {
		const base = slugify(text) || 'heading';
		const count = slugs.get(base) ?? 0;
		slugs.set(base, count + 1);
		return count ? `${base}-${count}` : base;
	};
}

export function isHeadingTag(tagName: string) {
	return HEADING_TAGS.includes(tagName);
}

export function headingLevel(tagName: string) {
	return Number(tagName.slice(1));
}

export function headingId(value: unknown) {
	return typeof value === 'string' && value ? value : null;
}

export function headingLinkNode(id: string): HeadingLinkNode {
	return {
		type: 'element',
		tagName: 'a',
		properties: {
			'aria-hidden': 'true',
			tabindex: -1,
			href: `#${id}`,
		},
		children: [
			{
				type: 'element',
				tagName: 'span',
				properties: { class: 'icon icon-link' },
				children: [],
			},
		],
	};
}

function slugify(text: string) {
	return text.toLowerCase().trim().replace(NON_SLUG_CHAR, '').replace(SLUG_SEPARATOR, '-');
}
