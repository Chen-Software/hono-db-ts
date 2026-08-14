import { defineSemanticTokens } from "@pandacss/dev";

export const blue = defineSemanticTokens.colors({
	"1": { value: { _light: "#fbfdff", _dark: "#0d1520" } },
	"2": { value: { _light: "#f5f9ff", _dark: "#111927" } },
	"3": { value: { _light: "#edf4ff", _dark: "#0d2847" } },
	"4": { value: { _light: "#e1edff", _dark: "#003362" } },
	"5": { value: { _light: "#d0e2ff", _dark: "#004077" } },
	"6": { value: { _light: "#bad6ff", _dark: "#004e8d" } },
	"7": { value: { _light: "#a1c9ff", _dark: "#005ea5" } },
	"8": { value: { _light: "#79afff", _dark: "#0073c4" } },
	"9": { value: { _light: "#0091ff", _dark: "#0091ff" } },
	"10": { value: { _light: "#0081f1", _dark: "#00a2ff" } },
	"11": { value: { _light: "#006adc", _dark: "#52adff" } },
	"12": { value: { _light: "#00254d", _dark: "#c2e1ff" } },
	a1: { value: { _light: "#0066ff04", _dark: "#0066ff0a" } },
	a2: { value: { _light: "#0077ff0a", _dark: "#2288ff11" } },
	a3: { value: { _light: "#0077ff12", _dark: "#1188ff2f" } },
	a4: { value: { _light: "#0077ff1e", _dark: "#0088ff4b" } },
	a5: { value: { _light: "#0077ff2f", _dark: "#0088ff5f" } },
	a6: { value: { _light: "#0077ff45", _dark: "#0088ff75" } },
	a7: { value: { _light: "#0077ff5e", _dark: "#0088ff8d" } },
	a8: { value: { _light: "#0077ff86", _dark: "#0088ffad" } },
	a9: { value: { _light: "#0091ff", _dark: "#0091ff" } },
	a10: { value: { _light: "#0081f1f1", _dark: "#00a2ffeb" } },
	a11: { value: { _light: "#006adce0", _dark: "#52adffff" } },
	a12: { value: { _light: "#00254de6", _dark: "#c2e1fff0" } },
	solid: {
		bg: {
			DEFAULT: {
				value: { _light: "{colors.blue.9}", _dark: "{colors.blue.9}" },
			},
			hover: {
				value: { _light: "{colors.blue.10}", _dark: "{colors.blue.10}" },
			},
		},
		fg: { DEFAULT: { value: { _light: "white", _dark: "white" } } },
	},
	subtle: {
		bg: {
			DEFAULT: {
				value: { _light: "{colors.blue.a3}", _dark: "{colors.blue.a3}" },
			},
			hover: {
				value: { _light: "{colors.blue.a4}", _dark: "{colors.blue.a4}" },
			},
			active: {
				value: { _light: "{colors.blue.a5}", _dark: "{colors.blue.a5}" },
			},
		},
		fg: {
			DEFAULT: {
				value: { _light: "{colors.blue.a11}", _dark: "{colors.blue.a11}" },
			},
		},
	},
	surface: {
		bg: {
			DEFAULT: {
				value: { _light: "{colors.blue.a2}", _dark: "{colors.blue.a2}" },
			},
			active: {
				value: { _light: "{colors.blue.a3}", _dark: "{colors.blue.a3}" },
			},
		},
		border: {
			DEFAULT: {
				value: { _light: "{colors.blue.a6}", _dark: "{colors.blue.a6}" },
			},
			hover: {
				value: { _light: "{colors.blue.a7}", _dark: "{colors.blue.a7}" },
			},
		},
		fg: {
			DEFAULT: {
				value: { _light: "{colors.blue.a11}", _dark: "{colors.blue.a11}" },
			},
		},
	},
	outline: {
		bg: {
			hover: {
				value: { _light: "{colors.blue.a2}", _dark: "{colors.blue.a2}" },
			},
			active: {
				value: { _light: "{colors.blue.a3}", _dark: "{colors.blue.a3}" },
			},
		},
		border: {
			DEFAULT: {
				value: { _light: "{colors.blue.a7}", _dark: "{colors.blue.a7}" },
			},
		},
		fg: {
			DEFAULT: {
				value: { _light: "{colors.blue.a11}", _dark: "{colors.blue.a11}" },
			},
		},
	},
	plain: {
		bg: {
			hover: {
				value: { _light: "{colors.blue.a3}", _dark: "{colors.blue.a3}" },
			},
			active: {
				value: { _light: "{colors.blue.a4}", _dark: "{colors.blue.a4}" },
			},
		},
		fg: {
			DEFAULT: {
				value: { _light: "{colors.blue.a11}", _dark: "{colors.blue.a11}" },
			},
		},
	},
});
