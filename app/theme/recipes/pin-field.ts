import { defineSlotRecipe } from "@pandacss/dev";
import { input } from "./input";

// Panda always gives variant styles cascade priority over `base` styles (a
// dedicated layer), so a conditional `base.input` override for one CSS
// property is silently beaten by an unconditional `variant.input` rule for
// that same property — e.g. the outline variant's own `borderColor`. These
// have to live inside every variant's own `input` block instead (same reason
// `input.ts`'s `_invalid` override lives inside each of its variant blocks,
// not in its `base`).
const pinFieldInputStates = {
	// A soft rest-state ring on the box the user would fill next, so the eye
	// is guided there even before it's actually focused. `--focus-ring-color`
	// is the variable `input.ts`'s `focusVisibleRing: "inside"` utility
	// already sets (with its own theme/global fallback baked in) on every
	// variant — reuse it directly rather than a bare `colorPalette.solid.bg`,
	// which is empty (and renders invisibly) unless the caller also happens
	// to pass a `colorPalette` prop.
	"&[data-active]:not(:focus-visible)": {
		borderColor: "var(--focus-ring-color)",
	},
	// Once every box is filled and nothing failed validation, a calm green
	// tint confirms completion without waiting on a submit round-trip.
	"&[data-complete]:not([data-invalid])": {
		borderColor: "green.8",
	},
};

export const pinField = defineSlotRecipe({
	className: "pin-field",
	slots: ["root", "label", "control", "input", "helperText", "errorText"],
	base: {
		root: {
			display: "flex",
			flexDirection: "column",
			gap: "1.5",
		},
		label: {
			alignItems: "center",
			color: "fg.default",
			display: "flex",
			gap: "0.5",
			textAlign: "start",
			userSelect: "none",
			textStyle: "label",
			_disabled: {
				layerStyle: "disabled",
			},
		},
		control: {
			display: "inline-flex",
			flexWrap: "wrap",
			gap: "2",
			isolation: "isolate",
		},
		input: {
			...input.base,
			textAlign: "center",
			width: "var(--input-height)",
			px: "1!",
			transitionProperty: "border-color, box-shadow, background-color",
			transitionDuration: "fast",
		},
		helperText: {
			color: "fg.muted",
			textStyle: "sm",
			_disabled: {
				layerStyle: "disabled",
			},
		},
		errorText: {
			color: "error",
			textStyle: "sm",
		},
	},
	defaultVariants: {
		size: "md",
		variant: "outline",
	},
	variants: {
		size: {
			xs: { input: input.variants?.size?.xs },
			sm: { input: input.variants?.size?.sm },
			md: { input: input.variants?.size?.md },
			lg: { input: input.variants?.size?.lg },
			xl: { input: input.variants?.size?.xl },
			"2xl": { input: input.variants?.size?.["2xl"] },
		},
		variant: {
			outline: {
				input: { ...input.variants?.variant?.outline, ...pinFieldInputStates },
			},
			subtle: {
				input: { ...input.variants?.variant?.subtle, ...pinFieldInputStates },
			},
			surface: {
				input: { ...input.variants?.variant?.surface, ...pinFieldInputStates },
			},
			flushed: {
				input: { ...input.variants?.variant?.flushed, ...pinFieldInputStates },
			},
		},
	},
});
