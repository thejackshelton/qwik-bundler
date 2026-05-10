import { Slot, _fnSignal, _jsxSorted, componentQrl, inlinedQrl } from '@qwik.dev/core';
import '@qwik.dev/core/jsx-runtime';
//#region ../_shared/src/library.tsx
const _hf0 = (p0) => p0.tone ?? 'neutral';
const Card = /* @__PURE__ */ componentQrl(
	/* @__PURE__ */ inlinedQrl(() => {
		return /* @__PURE__ */ _jsxSorted(
			'section',
			null,
			{ class: 'fixture-card' },
			/* @__PURE__ */ _jsxSorted(Slot, null, null, null, 3, 'n0_0'),
			1,
			'n0_1',
		);
	}, 'Card_component_YwB0DC5QlFo'),
);
const Badge = /* @__PURE__ */ componentQrl(
	/* @__PURE__ */ inlinedQrl((_rawProps) => {
		return /* @__PURE__ */ _jsxSorted(
			'span',
			{ 'data-tone': _fnSignal(_hf0, [_rawProps]) },
			null,
			'Fixture badge',
			3,
			'n0_2',
		);
	}, 'Badge_component_EGx0KOXAjyo'),
);
//#endregion
export { Badge, Card };
