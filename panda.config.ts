import { defineConfig } from "@pandacss/dev";
import { config as theme, conditions, globalCss } from "./app/theme";

/**
 * Panda CSS config for the Honox UI (in /app).
 *
 * The design system lives in `app/theme/` (a Park UI-style local theme: 55+
 * recipes, tokens, semantic tokens, keyframes, text/layer styles) and is wired
 * in here via the `config` export of `app/theme/index.ts`.
 *
 * Codegen writes the generated modules to the repo-root `design-system/` so the
 * app can import `design-system/css`, `design-system/recipes`,
 * `design-system/patterns` from anywhere under `app/` (aliased in
 * `vite.ui.config.ts` and `app/tsconfig.json`).
 *
 * `jsxFramework: "react"` + `styled-system`-style `css()` helpers are consumed
 * by the honox (hono/jsx) components in `app/components/ui`.
 */
export default defineConfig({
	// Entry points Panda scans for `css()`/`styled()` usage. Unit tests are
	// excluded — their sample props (e.g. `<Grid columns={4}>` in
	// grid.unit.test.tsx, `accept="image/*"` in file-upload.unit.test.tsx)
	// generate invalid CSS (numbers serialized as text tokens) and only exist
	// for test assertions, never for production styles.
	include: [
		"app/**/*.{ts,tsx}",
		"!app/**/*.unit.test.{ts,tsx}",
		"!app/**/*.test.{ts,tsx}",
	],
	outdir: "design-system",
	jsxFramework: "react",
	staticCss: {
		// Forces generation of the plain `colorPalette` utility class (sets the
		// `--colors-color-palette-*` scope vars) for every real palette name, so
		// components can apply it themselves via `css({ colorPalette })` instead
		// of each recipe re-declaring its own `colorPalette` variant. Aliases like
		// "success"/"error"/"warning" are normalised to a real palette name in
		// `app/components/ui/color-palette.ts` before reaching `css()`, so they
		// don't need entries here.
		css: [
			{
				properties: {
					colorPalette: [
						"gray",
						"blue",
						"green",
						"red",
						"orange",
						"purple",
						"cyan",
						"amber",
					],
				},
			},
			{
				properties: {
					textAlign: ["left", "center", "right", "justify", "start", "end"],
					// Kept as strings (not numbers) — `resolveStyleString` always
					// produces string values, parsed straight out of CSS text, and
					// the enumeration here has to match exactly what the runtime
					// `css()` call in `cmsCategoricalClass` actually passes.
					fontWeight: ["600", "bold"],
					textTransform: ["uppercase"],
					textDecoration: ["none"],
					justifyContent: ["flex-end"],
					flexWrap: ["wrap"],
					flexShrink: ["0"],
					letterSpacing: ["0.05em"],
					borderRadius: ["9999px"],
					color: ["var(--colors-fg-muted)"],
					borderBottom: ["1px solid var(--colors-border)"],
					borderTop: ["1px solid var(--colors-border)"],
				},
			},
		],

		// Every recipe here must keep `["*"]`: none of them (aside from alert,
		// button, skeleton, input) declare a `jsx: [...]` mapping in their recipe
		// definition, so Panda's static extractor cannot associate `<Foo size="sm">`
		// JSX usage with the recipe at all — it only sees `recipe(variantProps)`
		// calls inside the primitive files, always with a runtime-destructured
		// object, never literal args. Verified empirically: dropping force-generation
		// for e.g. `code` silently removed every non-default size/variant class
		// (`code--size_sm/lg/xl`, `code--variant_solid/surface/outline/plain`) even
		// though app/routes/index.tsx uses them all literally. A real reduction here
		// would require adding `jsx: [...]` to each recipe first — a separate,
		// larger change — not just trimming this list.
		recipes: {
			datePicker: ["*"],
			select: ["*"],
			search: ["*"],
			pagination: ["*"],
			absoluteCenter: ["*"],
			avatar: ["*"],
			alert: ["*"],
			badge: ["*"],
			breadcrumb: ["*"],
			button: ["*"],
			card: ["*"],
			carousel: ["*"],
			checkbox: ["*"],
			clipboard: ["*"],
			code: ["*"],
			collapsible: ["*"],
			colorPicker: ["*"],
			combobox: ["*"],
			dialog: ["*"],
			drawer: ["*"],
			editable: ["*"],
			field: ["*"],
			fieldset: ["*"],
			fileUpload: ["*"],
			group: ["*"],
			heading: ["*"],
			hoverCard: ["*"],
			icon: ["*"],
			input: ["*"],
			layout: ["*"],
			anchor: ["*"],
			dropdown: ["*"],
			pinField: ["*"],
			popover: ["*"],
			progress: ["*"],
			radioCardGroup: ["*"],
			ratingGroup: ["*"],
			segmentGroup: ["*"],
			skeleton: ["*"],
			slider: ["*"],
			spinner: ["*"],
			splitter: ["*"],
			switchRecipe: ["*"],
			table: ["*"],
			tagsField: ["*"],
			text: ["*"],
			textarea: ["*"],
			toast: ["*"],
			toggleGroup: ["*"],
			tooltip: ["*"],
			gridRow: ["*"],
			gridCol: ["*"],
		},
		patterns: {
			stack: ["*"],
			grid: [
				{
					properties: { columns: [1, 2, 3] },
					responsive: true,
				},
			],
		},
	},

	// Disable JSX framework (using Hono JSX instead)
	jsxFramework: undefined,

	plugins: [
		{
			name: "Remove Panda Preset Colors",
			hooks: {
				"preset:resolved": ({ utils, preset, name }) =>
					name === "@pandacss/preset-panda"
						? utils.omit(preset, [
								"theme.tokens.colors",
								"theme.semanticTokens.colors",
							])
						: preset,
			},
		},
	],

	globalCss: globalCss,
	conditions: conditions,
});
