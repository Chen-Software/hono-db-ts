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
	conditions,
	globalCss,
	theme: {
		extend: theme,
	},
});
