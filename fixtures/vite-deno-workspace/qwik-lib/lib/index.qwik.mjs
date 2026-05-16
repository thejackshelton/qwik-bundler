import { _fnSignal, _jsxSorted, componentQrl, inlinedQrl } from '@qwik.dev/core';
import '@qwik.dev/core/jsx-runtime';

const tone = (props) => props.tone ?? 'neutral';

export const WorkspaceBadge = componentQrl(
	inlinedQrl((props) => {
		return _jsxSorted(
			'span',
			{ 'data-tone': _fnSignal(tone, [props]) },
			null,
			'Deno workspace badge',
			3,
			'deno_0',
		);
	}, 'WorkspaceBadge_component_DenoFixture'),
);
