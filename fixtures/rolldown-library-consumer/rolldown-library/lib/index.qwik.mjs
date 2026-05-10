import { Slot, _fnSignal, _jsxSorted, componentQrl, inlinedQrl } from '@qwik.dev/core';
import '@qwik.dev/core/jsx-runtime';
//#region src/index.tsx
const _hf0 = (p0) => p0.tone ?? 'neutral';
const Card = /* @__PURE__ */ componentQrl(
	/* @__PURE__ */ inlinedQrl(() => {
		return /* @__PURE__ */ _jsxSorted(
			'section',
			null,
			{ class: 'fixture-card' },
			/* @__PURE__ */ _jsxSorted(Slot, null, null, null, 3, 'St_0'),
			1,
			'St_1',
		);
	}, 'Card_component_D8Jm0aJFndY'),
);
const Badge = /* @__PURE__ */ componentQrl(
	/* @__PURE__ */ inlinedQrl((_rawProps) => {
		return /* @__PURE__ */ _jsxSorted(
			'span',
			{ 'data-tone': _fnSignal(_hf0, [_rawProps]) },
			null,
			'Rolldown library badge',
			3,
			'St_2',
		);
	}, 'Badge_component_RWYXgGZf4KY'),
);
//#endregion
export { Badge, Card };
