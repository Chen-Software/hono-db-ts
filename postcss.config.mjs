/**
 * postcss — PostCSS config for the Honox UI.
 *
 * Wires the Panda CSS PostCSS plugin so the atomic utilities (from
 * `panda.config.ts`) are generated into `styled-system/` and inlined into the
 * CSS built from `app/style.css` (`@import '../styled-system/styles.css'`).
 *
 * Vite picks this file up automatically for both the dev server and the
 * `vite.ui.config.ts` builds (client + SSR phases).
 */
export default {
	plugins: {
		"@pandacss/dev/postcss": {},
	},
};
