import { css } from '../../design-system/css'
import { useState } from 'hono/jsx'

/**
 * ThemeSwitcher — a client-side island that switches the whole app's accent
 * color palette at runtime.
 *
 * The accent color is driven by Panda's `colorPalette` CSS variables
 * (`--colors-color-palette-*`), which `app/theme/global-css.ts` scopes per
 * accent via `html[data-palette=*]` selectors. So flipping the palette is
 * literally one DOM mutation:
 *
 *     document.documentElement.dataset.palette = "blue"
 *
 * The choice is persisted to localStorage (`bbs.palette`) and restored by the
 * boot script in `_renderer.tsx` before first paint, avoiding a flash.
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

const STORAGE_KEY = 'bbs.palette'

/** Current palette from the DOM (already set by the boot script). */
function currentPalette(): ThemePalette {
	const v = typeof document !== 'undefined' ? document.documentElement.dataset.palette : undefined
	return (v as ThemePalette) || 'gray'
}

export default function ThemeSwitcher() {
	const [open, setOpen] = useState(false)
	const [palette, setPalette] = useState<ThemePalette>(currentPalette)

	const apply = (p: ThemePalette) => {
		document.documentElement.dataset.palette = p
		try {
			localStorage.setItem(STORAGE_KEY, p)
		} catch {
			// localStorage unavailable (private mode) — the DOM switch still works.
		}
		setPalette(p)
	}

	const current = PALETTES.find((p) => p.name === palette) ?? PALETTES[0]

	return (
		<div class={css({ position: 'relative' })}>
			{/* Trigger */}
			<button
				type="button"
				aria-label="Change accent color"
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
					bg: 'white',
					cursor: 'pointer',
					_hover: { bg: '#fafafa' },
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
					aria-label="Accent color"
					class={css({
						position: 'absolute',
						right: 0,
						top: 'calc(100% + 0.5rem)',
						zIndex: 20,
						w: 44,
						rounded: 'xl',
						border: '1px solid token(colors.border)',
						bg: 'white',
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
							color: 'muted',
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
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
									onClick={() => apply(p.name)}
									class={css({
										display: 'flex',
										alignItems: 'center',
										gap: 2,
										px: 2,
										py: 1.5,
										rounded: 'md',
										border: 'none',
										bg: active ? '#f4f4f5' : 'transparent',
										fontSize: 'sm',
										color: 'ink',
										cursor: 'pointer',
										_hover: { bg: '#fafafa' },
									})}
								>
									<span
										class={css({
											display: 'inline-block',
											w: 3.5,
											h: 3.5,
											rounded: 'full',
											bg: p.swatch,
											border: active ? '2px solid token(colors.colorPalette.solid.bg)' : '1px solid rgba(0,0,0,0.08)',
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
