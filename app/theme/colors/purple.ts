import { defineSemanticTokens } from "@pandacss/dev";

export const purple = defineSemanticTokens.colors({
	"1": { value: { _light: "#fefbff", _dark: "#17121c" } },
	"2": { value: { _light: "#fbf7fe", _dark: "#1b1425" } },
	"3": { value: { _light: "#f5eeff", _dark: "#281a42" } },
	"4": { value: { _light: "#eddfff", _dark: "#331e53" } },
	"5": { value: { _light: "#e2cdff", _dark: "#3c2462" } },
	"6": { value: { _light: "#d4b6ff", _dark: "#4a2d76" } },
	"7": { value: { _light: "#c196ff", _dark: "#5e3993" } },
	"8": { value: { _light: "#a767ff", _dark: "#7d4bc3" } },
	"9": { value: { _light: "#8e4ec6", _dark: "#8e4ec6" } },
	"10": { value: { _light: "#8445bc", _dark: "#9d5bd2" } },
	"11": { value: { _light: "#793aaf", _dark: "#bf7af0" } },
	"12": { value: { _light: "#2b1440", _dark: "#e8d5ff" } },
	a1: { value: { _light: "#a200ff04", _dark: "#ac48ff08" } },
	a2: { value: { _light: "#9000fe08", _dark: "#ab40ff14" } },
	a3: { value: { _light: "#8400ff11", _dark: "#ac60ff31" } },
	a4: { value: { _light: "#8300ff20", _dark: "#ad56ff42" } },
	a5: { value: { _light: "#8200ff32", _dark: "#ab61ff53" } },
	a6: { value: { _light: "#8100ff49", _dark: "#ab69ff6a" } },
	a7: { value: { _light: "#7c00ff69", _dark: "#ac75ff89" } },
	a8: { value: { _light: "#7300ff98", _dark: "#ae78ffba" } },
	a9: { value: { _light: "#7000afb1", _dark: "#ab5fd2e4" } },
	a10: { value: { _light: "#6e00abba", _dark: "#b263f3eb" } },
	a11: { value: { _light: "#6400a4c5", _dark: "#bf7af0" } },
	a12: { value: { _light: "#18002feb", _dark: "#e8d5ff" } },
	solid: {
		bg: {
			DEFAULT: {
				value: { _light: "{colors.purple.9}", _dark: "{colors.purple.9}" },
			},
			hover: {
				value: { _light: "{colors.purple.10}", _dark: "{colors.purple.10}" },
			},
		},
		fg: { DEFAULT: { value: { _light: "white", _dark: "white" } } },
	},
	subtle: {
		bg: {
			DEFAULT: {
				value: { _light: "{colors.purple.a3}", _dark: "{colors.purple.a3}" },
			},
			hover: {
				value: { _light: "{colors.purple.a4}", _dark: "{colors.purple.a4}" },
			},
			active: {
				value: { _light: "{colors.purple.a5}", _dark: "{colors.purple.a5}" },
			},
		},
		fg: {
			DEFAULT: {
				value: { _light: "{colors.purple.a11}", _dark: "{colors.purple.a11}" },
			},
		},
	},
	surface: {
		bg: {
			DEFAULT: {
				value: { _light: "{colors.purple.a2}", _dark: "{colors.purple.a2}" },
			},
			active: {
				value: { _light: "{colors.purple.a3}", _dark: "{colors.purple.a3}" },
			},
		},
		border: {
			DEFAULT: {
				value: { _light: "{colors.purple.a6}", _dark: "{colors.purple.a6}" },
			},
			hover: {
				value: { _light: "{colors.purple.a7}", _dark: "{colors.purple.a7}" },
			},
		},
		fg: {
			DEFAULT: {
				value: { _light: "{colors.purple.a11}", _dark: "{colors.purple.a11}" },
			},
		},
	},
	outline: {
		bg: {
			hover: {
				value: { _light: "{colors.purple.a2}", _dark: "{colors.purple.a2}" },
			},
			active: {
				value: { _light: "{colors.purple.a3}", _dark: "{colors.purple.a3}" },
			},
		},
		border: {
			DEFAULT: {
				value: { _light: "{colors.purple.a7}", _dark: "{colors.purple.a7}" },
			},
		},
		fg: {
			DEFAULT: {
				value: { _light: "{colors.purple.a11}", _dark: "{colors.purple.a11}" },
			},
		},
	},
	plain: {
		bg: {
			hover: {
				value: { _light: "{colors.purple.a3}", _dark: "{colors.purple.a3}" },
			},
			active: {
				value: { _light: "{colors.purple.a4}", _dark: "{colors.purple.a4}" },
			},
		},
		fg: {
			DEFAULT: {
				value: { _light: "{colors.purple.a11}", _dark: "{colors.purple.a11}" },
			},
		},
	},
});
