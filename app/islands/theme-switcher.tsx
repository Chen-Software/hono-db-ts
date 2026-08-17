import { css } from '../../design-system/css'
import { useEffect, useState } from 'hono/jsx'
import { SegmentGroup } from '../components/ui/segment-group'

/**
 * ThemeSwitcher — a client-side island that switches the whole app's
 * appearance: the color scheme (Light / Dark / System) and the accent color
 * palette.
 *
 * Color scheme
 * ------------
 * The CSS is driven by `html[data-theme=light|dark]` attribute selectors
 * (`app/theme/conditions.ts` maps Panda's `_light`/`_dark` conditions to
 * them; there is no `prefers-color-scheme` fallback in the tokens). So the
 * switcher writes one DOM mutation:
 *
 *     document.documentElement.dataset.theme = "dark"
 *
 * The *preference* (`light` | `dark` | `system`) is persisted to localStorage
 * (`cf.theme`) and resolved to an attribute before first paint by the boot
 * script in `_renderer.tsx` — `system` is resolved against
 * `prefers-color-scheme` there and kept live via a `matchMedia` listener.
 *
 * Accent palette
 * --------------
 * The accent color is driven by Panda's `colorPalette` CSS variables
 * (`--colors-color-palette-*`), which `app/theme/global-css.ts` scopes per
 * accent via `html[data-palette=*]` selectors. So flipping the palette is
 * literally one DOM mutation:
 *
 *     document.documentElement.dataset.palette = "blue"
 *
 * The choice is persisted to localStorage (`cf.palette`) and restored by the
 * same boot script before first paint, avoiding a flash.
 *
 * The swatch colors below mirror each palette's `9`-scale (accent solid) token
 * in the light scheme — keep them in sync with `app/theme/colors/*.ts`.
 */

export type ThemePalette =
	| 'gray'
	| 'blue'
	| 'green'
	| 'orange'
	| 'purple'
	| 'cyan'
	| 'amber'
	| 'red'

export type ThemeMode = 'light' | 'dark' | 'system'

const PALETTES: Array<{ name: ThemePalette; label: string; swatch: string }> = [
	{ name: 'gray', label: 'Slate', swatch: '#6e7280' },
	{ name: 'blue', label: 'Blue', swatch: '#0091ff' },
	{ name: 'green', label: 'Green', swatch: '#30a46c' },
	{ name: 'orange', label: 'Orange', swatch: '#f76b15' },
	{ name: 'purple', label: 'Purple', swatch: '#8e4ec6' },
	{ name: 'cyan', label: 'Cyan', swatch: '#00a2c7' },
	{ name: 'amber', label: 'Amber', swatch: '#f5a90b' },
	{ name: 'red', label: 'Red', swatch: '#e5484d' },
]

const THEME_MODES: Array<{ name: ThemeMode; label: string }> = [
	{ name: 'light', label: 'Light' },
	{ name: 'dark', label: 'Dark' },
	{ name: 'system', label: 'System' },
]

const PALETTE_KEY = 'cf.palette'
const THEME_KEY = 'cf.theme'

/** Current palette from the DOM (already set by the boot script). */
function currentPalette(): ThemePalette {
	const v = typeof document !== 'undefined' ? document.documentElement.dataset.palette : undefined
	return (v as ThemePalette) || 'gray'
}

/** Stored theme preference (the boot script already resolved it to data-theme). */
function currentTheme(): ThemeMode {
	if (typeof document === 'undefined') return 'system'
	try {
		const v = localStorage.getItem(THEME_KEY)
		if (v === 'light' || v === 'dark' || v === 'system') return v
	} catch {
		// localStorage unavailable — default to system.
	}
	return 'system'
}

/** Resolve the OS preference to a concrete `data-theme` attribute value. */
function resolveSystemTheme(): 'light' | 'dark' {
	if (typeof window === 'undefined') return 'light'
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function ThemeSwitcher() {
	const [open, setOpen] = useState(false)
	const [palette, setPalette] = useState<ThemePalette>(currentPalette)
	const [theme, setTheme] = useState<ThemeMode>(currentTheme)

	// Keep an explicit "System" choice live: re-resolve `data-theme` whenever
	// the OS preference flips (the boot script's listener covers reloads; this
	// covers switching to System mid-session).
	useEffect(() => {
		if (theme !== 'system') return
		const mq = window.matchMedia('(prefers-color-scheme: dark)')
		const onChange = (e: MediaQueryListEvent) => {
			document.documentElement.dataset.theme = e.matches ? 'dark' : 'light'
		}
		mq.addEventListener('change', onChange)
		return () => mq.removeEventListener('change', onChange)
	}, [theme])

	const applyPalette = (p: ThemePalette) => {
		document.documentElement.dataset.palette = p
		try {
			localStorage.setItem(PALETTE_KEY, p)
		} catch {
			// localStorage unavailable (private mode) — the DOM switch still works.
		}
		setPalette(p)
	}

	const applyTheme = (t: ThemeMode) => {
		document.documentElement.dataset.theme = t === 'system' ? resolveSystemTheme() : t
		try {
			localStorage.setItem(THEME_KEY, t)
		} catch {
			// localStorage unavailable — the DOM switch still works.
		}
		setTheme(t)
	}

	const current = PALETTES.find((p) => p.name === palette) ?? PALETTES[0]

	return (
		<div class={css({ position: 'relative' })}>
			{/* Trigger */}
			<button
				type="button"
				aria-label="Change appearance"
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				class={css({
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					w: 9,
					h: 9,
					rounded: 'md',
					border: '1px solid token(colors.border)',
					bg: 'colorPalette.surface.bg',
					cursor: 'pointer',
					_hover: { bg: 'colorPalette.surface.bg.hover' },
				})}
			>
				<span
					class={css({
						display: 'inline-block',
						w: 4,
						h: 4,
						rounded: 'full',
						bg: current.swatch,
					})}
				/>
			</button>

			{/* Popover */}
			{open && (
				<div
					role="dialog"
					aria-label="Appearance"
					class={css({
						position: 'absolute',
						right: 0,
						top: 'calc(100% + 0.5rem)',
						zIndex: 20,
						w: 56,
						rounded: 'xl',
						border: '1px solid token(colors.border)',
						bg: 'colorPalette.surface.bg',
						color: 'fg.default',
						boxShadow: '0 12px 32px rgba(17,24,39,0.12)',
						p: 2,
					})}
				>
					<div
						class={css({
							px: 2,
							py: 1.5,
							fontSize: 'xs',
							fontWeight: 600,
							color: 'fg.subtle',
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
						})}
					>
						Theme
					</div>

					<div class={css({ px: 2, pb: 2 })}>
						<SegmentGroup
							size="xs"
							fitted
							value={theme}
							onValueChange={(v) => applyTheme(v as ThemeMode)}
							items={THEME_MODES.map((t) => ({ value: t.name, label: t.label }))}
						/>
					</div>

					<div
						class={css({
							px: 2,
							py: 1.5,
							fontSize: 'xs',
							fontWeight: 600,
							color: 'fg.subtle',
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
							borderTop: '1px solid token(colors.border)',
							mt: 1,
						})}
					>
						Accent color
					</div>

					<div class={css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 })}>
						{PALETTES.map((p) => {
							const active = p.name === palette
							return (
								<button
									key={p.name}
									type="button"
									onClick={() => applyPalette(p.name)}
									class={css({
										display: 'flex',
										alignItems: 'center',
										gap: 2,
										px: 2,
										py: 1.5,
										rounded: 'md',
										border: 'none',
										bg: active ? 'colorPalette.subtle.bg' : 'transparent',
										fontSize: 'sm',
										color: 'fg.default',
										cursor: 'pointer',
										_hover: { bg: 'colorPalette.subtle.bg.hover' },
									})}
									>
									<span
										class={css({
											display: 'inline-block',
											w: 3.5,
											h: 3.5,
											rounded: 'full',
											bg: p.swatch,
											border: active ? '2px solid token(colors.colorPalette.solid.bg)' : '1px solid token(colors.border)',
											flexShrink: 0,
										})}
									/>
									<span>{p.label}</span>
								</button>
							)
						})}
					</div>
				</div>
			)}
		</div>
	)
}
