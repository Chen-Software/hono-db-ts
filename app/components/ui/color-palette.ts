import { css } from "design-system/css";

export type ColorPalette =
	| "gray"
	| "blue"
	| "green"
	| "red"
	| "orange"
	| "purple"
	| "cyan"
	| "amber"
	| "slate"
	| "success"
	| "error"
	| "warning";

const ALIASES: Partial<Record<ColorPalette, string>> = {
	success: "green",
	error: "red",
	warning: "orange",
	// The theme only registers a "gray" palette (see app/theme/colors/slate.ts
	// — it's Radix's `slate` scale, mapped to the `gray` semantic token key),
	// but a lot of CMS content was authored with `colorPalette: "slate"`
	// directly, matching radio-card-group.ts's existing gray/slate alias.
	slate: "gray",
};

/**
 * Applies a `colorPalette` accent to a component instance via Panda's plain
 * `colorPalette` utility (force-generated for every real palette name in
 * `panda.config.ts`'s `staticCss.css`), instead of every recipe re-declaring
 * its own `colorPalette` variant. Mirrors what Panda's `jsxFramework`
 * integration does automatically for React/Vue/Solid — unavailable here
 * since this repo uses raw hono/jsx (`jsxFramework: undefined`).
 */
export function colorPaletteClass(colorPalette?: string): string | undefined {
	if (!colorPalette) return undefined;
	return css({
		colorPalette: ALIASES[colorPalette as ColorPalette] ?? colorPalette,
	});
}
