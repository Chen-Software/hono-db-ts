import { defineSemanticTokens } from "@pandacss/dev";

export const orange = defineSemanticTokens.colors({
	"1": { value: { _light: "#fffcfb", _dark: "#17120e" } },
	"2": { value: { _light: "#fff8f4", _dark: "#1e1410" } },
	"3": { value: { _light: "#ffeedd", _dark: "#331e13" } },
	"4": { value: { _light: "#ffdfbf", _dark: "#462612" } },
	"5": { value: { _light: "#ffcf9f", _dark: "#552f15" } },
	"6": { value: { _light: "#ffbc7d", _dark: "#653b1b" } },
	"7": { value: { _light: "#f5a45e", _dark: "#7c4a23" } },
	"8": { value: { _light: "#e68a3d", _dark: "#a35d2a" } },
	"9": { value: { _light: "#f76b15", _dark: "#f76b15" } },
	"10": { value: { _light: "#ef5f00", _dark: "#ff801f" } },
	"11": { value: { _light: "#cc4e00", _dark: "#ffa057" } },
	"12": { value: { _light: "#582d1d", _dark: "#ffe0c2" } },
	a1: { value: { _light: "#ff440004", _dark: "#ff880008" } },
	a2: { value: { _light: "#ff5e000b", _dark: "#ff8c4011" } },
	a3: { value: { _light: "#ff770022", _dark: "#ff8c402d" } },
	a4: { value: { _light: "#ff880040", _dark: "#ff914144" } },
	a5: { value: { _light: "#ff8c0060", _dark: "#ff9c4556" } },
	a6: { value: { _light: "#ff8e0082", _dark: "#ffaa4b6b" } },
	a7: { value: { _light: "#f07a00a1", _dark: "#ffaf5f85" } },
	a8: { value: { _light: "#e26f00c2", _dark: "#ffae5fae" } },
	a9: { value: { _light: "#f66400eb", _dark: "#ff7420e5" } },
	a10: { value: { _light: "#ef5f00", _dark: "#ff801ff1" } },
	a11: { value: { _light: "#cc4e00", _dark: "#ffa057" } },
	a12: { value: { _light: "#421808e2", _dark: "#ffe0c2f0" } },
	solid: {
		bg: {
			DEFAULT: {
				value: { _light: "{colors.orange.9}", _dark: "{colors.orange.9}" },
			},
			hover: {
				value: { _light: "{colors.orange.10}", _dark: "{colors.orange.10}" },
			},
		},
		fg: { DEFAULT: { value: { _light: "white", _dark: "white" } } },
	},
	subtle: {
		bg: {
			DEFAULT: {
				value: { _light: "{colors.orange.a3}", _dark: "{colors.orange.a3}" },
			},
			hover: {
				value: { _light: "{colors.orange.a4}", _dark: "{colors.orange.a4}" },
			},
			active: {
				value: { _light: "{colors.orange.a5}", _dark: "{colors.orange.a5}" },
			},
		},
		fg: {
			DEFAULT: {
				value: { _light: "{colors.orange.a11}", _dark: "{colors.orange.a11}" },
			},
		},
	},
	surface: {
		bg: {
			DEFAULT: {
				value: { _light: "{colors.orange.a2}", _dark: "{colors.orange.a2}" },
			},
			active: {
				value: { _light: "{colors.orange.a3}", _dark: "{colors.orange.a3}" },
			},
		},
		border: {
			DEFAULT: {
				value: { _light: "{colors.orange.a6}", _dark: "{colors.orange.a6}" },
			},
			hover: {
				value: { _light: "{colors.orange.a7}", _dark: "{colors.orange.a7}" },
			},
		},
		fg: {
			DEFAULT: {
				value: { _light: "{colors.orange.a11}", _dark: "{colors.orange.a11}" },
			},
		},
	},
	outline: {
		bg: {
			hover: {
				value: { _light: "{colors.orange.a2}", _dark: "{colors.orange.a2}" },
			},
			active: {
				value: { _light: "{colors.orange.a3}", _dark: "{colors.orange.a3}" },
			},
		},
		border: {
			DEFAULT: {
				value: { _light: "{colors.orange.a7}", _dark: "{colors.orange.a7}" },
			},
		},
		fg: {
			DEFAULT: {
				value: { _light: "{colors.orange.a11}", _dark: "{colors.orange.a11}" },
			},
		},
	},
	plain: {
		bg: {
			hover: {
				value: { _light: "{colors.orange.a3}", _dark: "{colors.orange.a3}" },
			},
			active: {
				value: { _light: "{colors.orange.a4}", _dark: "{colors.orange.a4}" },
			},
		},
		fg: {
			DEFAULT: {
				value: { _light: "{colors.orange.a11}", _dark: "{colors.orange.a11}" },
			},
		},
	},
});
