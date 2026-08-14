import { defineSlotRecipe } from "@pandacss/dev";

export const splitter = defineSlotRecipe({
	className: "splitter",
	slots: ["root", "panel", "resizeTrigger", "resizeTriggerIndicator"],
	base: {
		root: {
			display: "flex",
			gap: "2",
			_horizontal: {
				flexDirection: "row",
				width: "full",
			},
			_vertical: {
				flexDirection: "column",
				height: "full",
			},
		},
		panel: {
			borderRadius: "l3",
			display: "flex",
			background: "gray.surface.bg",
			borderWidth: "1px",
			p: "4",
			overflow: "auto",
		},
		resizeTrigger: {
			borderRadius: "l3",
			transition: "common",
			outline: "0",
			background: "gray.subtle.bg",
			_hover: {
				background: "gray.active.bg",
			},
			_active: {
				background: "gray.active.bg",
			},
			_horizontal: {
				minWidth: "1.5",
				cursor: "col-resize",
				margin: "0 -1",
			},
			_vertical: {
				minHeight: "1.5",
				cursor: "row-resize",
				margin: "-1 0",
			},
			_disabled: {
				cursor: "not-allowed",
				opacity: "0.5",
			},
		},
	},
});
