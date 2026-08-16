import { cx, css } from '../../design-system/css'
import { search } from '../../design-system/recipes'
import { useEffect, useId, useRef, useState } from 'hono/jsx'
import { CloseIcon } from '../icons/close'
import { SearchIcon } from '../icons/search'

type SearchResult = {
	repositories: Array<{
		id: string
		name: string
		lowerName: string
		description: string
		isPrivate: boolean
		numStars: number
		owner_name: string | null
	}>
}

type Suggestion = {
	kind: 'repository'
	href: string
	title: string
	description: string
	tag?: string
}

export type SearchBoxProps = {
	placeholder?: string
	initialQuery?: string
	/** Debounce delay (ms) for type-ahead queries. Default 250. */
	debounceMs?: number
	/** Max suggestions to request from the API. Default 8. */
	maxSuggestions?: number
	/** Show a "N results" count line. Default true. */
	showCount?: boolean
	/** Label used for the count line ("results"). */
	itemLabel?: string
	/** Keep `?q=` in the URL as you search (history.replaceState). Default false. */
	syncUrl?: boolean
	size?: 'sm' | 'md' | 'lg'
	variant?: 'outline' | 'surface' | 'subtle'
	class?: string
	style?: any
}

/** Format an ISO timestamp as a short relative age ("3h ago"). */
function timeAgo(iso: string): string {
	const t = new Date(iso).getTime()
	if (Number.isNaN(t)) return ''
	const s = Math.max(1, Math.floor((Date.now() - t) / 1000))
	if (s < 60) return `${s}s ago`
	const m = Math.floor(s / 60)
	if (m < 60) return `${m}m ago`
	const h = Math.floor(m / 60)
	if (h < 24) return `${h}h ago`
	const d = Math.floor(h / 24)
	if (d < 30) return `${d}d ago`
	return new Date(iso).toLocaleDateString('en-CA')
}

/**
 * SearchBox — a client-side island that queries the JSON API (`/api/search?q=`)
 * and renders the matching threads + posts in a live autocomplete dropdown.
 * The API is served by the same app (`app/server.ts` mounts `buildQueryApp`
 * under `/api`), so this works whether the page is served by
 * `bun run src/main.ts serve` or the UI dev server.
 *
 * Behavior: debounced type-ahead (ArrowDown/Up to highlight, Enter to open the
 * highlighted result or run a full search, Escape / outside-click to close),
 * optional "N results" count line and URL sync. Styling comes from the `search`
 * slot recipe — the same one powering the static `SearchBase` form.
 */
export default function SearchBox(props: SearchBoxProps) {
	const [variantProps, localProps] = search.splitVariantProps(props)
	const {
		placeholder = 'Search repositories…',
		initialQuery = '',
		debounceMs = 250,
		maxSuggestions = 8,
		showCount = true,
		itemLabel = 'results',
		syncUrl = false,
		class: classProp,
		style,
	} = localProps
	const styles = search(variantProps)

	const [q, setQ] = useState(initialQuery)
	const [result, setResult] = useState<SearchResult | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const [activeIndex, setActiveIndex] = useState(-1)

	const uid = useId()
	const listboxId = `search-listbox-${uid}`
	const rootRef = useRef<HTMLDivElement | null>(null)
	const timerRef = useRef<number | undefined>(undefined)
	const requestIdRef = useRef(0)

	const suggestions: Suggestion[] = []
	if (result) {
		for (const r of result.repositories) {
			suggestions.push({
				kind: 'repository',
				href: `/repositories/${r.id}`,
				title: `${r.owner_name ?? 'unknown'}/${r.name}`,
				description: `${r.numStars} stars`,
				tag: r.isPrivate ? 'private' : undefined,
			})
		}
	}
	const total = result?.repositories.length ?? 0
	const open = result !== null || error !== null || loading

	const run = async (query: string) => {
		const trimmed = query.trim()
		if (!trimmed) {
			setResult(null)
			setError(null)
			setLoading(false)
			return
		}
		const requestId = ++requestIdRef.current
		setError(null)
		setLoading(true)
		try {
			const res = await fetch(
				`/api/search?q=${encodeURIComponent(trimmed)}&limit=${maxSuggestions}`,
			)
			if (requestId !== requestIdRef.current) return // stale response
			if (!res.ok) throw new Error(`search failed (${res.status})`)
			const body = (await res.json()) as { ok: boolean; data: SearchResult }
			if (requestId !== requestIdRef.current) return
			setResult(body.data)
			setActiveIndex(-1)
			if (syncUrl) {
				const url = new URL(window.location.href)
				url.searchParams.set('q', trimmed)
				window.history.replaceState(null, '', url)
			}
		} catch (e) {
			if (requestId !== requestIdRef.current) return
			setError((e as Error).message)
			setResult(null)
			setActiveIndex(-1)
		} finally {
			if (requestId === requestIdRef.current) setLoading(false)
		}
	}

	const onInput = (e: Event) => {
		const value = (e.target as HTMLInputElement).value
		setQ(value)
		setActiveIndex(-1)
		if (timerRef.current !== undefined) {
			clearTimeout(timerRef.current)
			timerRef.current = undefined
		}
		if (!value.trim()) {
			setResult(null)
			setError(null)
			return
		}
		// Debounced type-ahead. Keep the previous dropdown until new results
		// replace it (standard autocomplete behavior).
		timerRef.current = window.setTimeout(() => run(value), debounceMs)
	}

	const clear = () => {
		if (timerRef.current !== undefined) {
			clearTimeout(timerRef.current)
			timerRef.current = undefined
		}
		setQ('')
		setResult(null)
		setError(null)
		setLoading(false)
		setActiveIndex(-1)
	}

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault()
			if (suggestions.length === 0) {
				// Nothing to highlight yet — open with a fresh search.
				if (!open && !loading) run(q)
				return
			}
			setActiveIndex((i) => (i + 1) % suggestions.length)
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			if (suggestions.length === 0) return
			setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
		} else if (e.key === 'Enter') {
			if (open && activeIndex >= 0 && suggestions[activeIndex]) {
				e.preventDefault()
				window.location.assign(suggestions[activeIndex].href)
				return
			}
			// Full search — cancel any pending debounce and run now.
			if (timerRef.current !== undefined) {
				clearTimeout(timerRef.current)
				timerRef.current = undefined
			}
			run(q)
		} else if (e.key === 'Escape') {
			if (open) {
				e.preventDefault()
				setResult(null)
				setError(null)
				setLoading(false)
				setActiveIndex(-1)
			} else if (q) {
				e.preventDefault()
				clear()
			}
		}
	}

	// Close when clicking outside the box.
	useEffect(() => {
		const onPointerDown = (e: PointerEvent) => {
			const root = rootRef.current
			if (root && !root.contains(e.target as Node)) {
				setResult(null)
				setError(null)
				setLoading(false)
				setActiveIndex(-1)
			}
		}
		document.addEventListener('pointerdown', onPointerDown)
		return () => document.removeEventListener('pointerdown', onPointerDown)
	}, [])

	// Cancel pending debounce on unmount.
	useEffect(() => {
		return () => {
			if (timerRef.current !== undefined) clearTimeout(timerRef.current)
		}
	}, [])

	const groupHeader = css({
		px: 3,
		pt: 2,
		pb: 1,
		fontSize: 'xs',
		fontWeight: 700,
		color: 'fg.subtle',
		textTransform: 'uppercase',
		letterSpacing: '0.05em',
	})

	const renderItem = (s: Suggestion, index: number) => {
		const highlighted = index === activeIndex
		return (
			<a
				key={s.href}
				href={s.href}
				role="option"
				aria-selected={highlighted}
				id={`${listboxId}-option-${index}`}
				data-highlighted={highlighted ? '' : undefined}
				onMouseEnter={() => setActiveIndex(index)}
				class={styles.item}
			>
				<span class={styles.itemTitle}>{s.title}</span>
				<span class={styles.itemDescription}>{s.description}</span>
				{s.tag && <span class={styles.itemTags}>{s.tag}</span>}
			</a>
		)
	}

	return (
		<div ref={rootRef} class={cx(styles.root, classProp)} style={style}>
			<div class={styles.inputWrap}>
				<div class={styles.icon}>
					<SearchIcon width="20" height="20" />
				</div>
				<input
					type="text"
					role="combobox"
					aria-expanded={open}
					aria-controls={listboxId}
					aria-autocomplete="list"
					aria-activedescendant={
						activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
					}
					value={q}
					onInput={onInput}
					onKeyDown={onKeyDown}
					placeholder={placeholder}
					class={styles.input}
				/>
				{q && (
					<button
						type="button"
						onClick={clear}
						aria-label="Clear search"
						class={styles.clearTrigger}
					>
						<CloseIcon width="16" height="16" />
					</button>
				)}
			</div>

			{open && (
				<div id={listboxId} role="listbox" class={styles.listbox}>
					{loading && total === 0 ? (
						<p class={styles.status}>Searching…</p>
					) : error ? (
						<p class={styles.status}>{error}</p>
					) : total === 0 ? (
						<p class={styles.status}>No results.</p>
					) : (
						<>
							{showCount && (
								<p class={cx(styles.countText, css({ px: 3, pt: 2, pb: 1 }))}>
									{total.toLocaleString()} {itemLabel}
								</p>
							)}
							{total > 0 && (
								<div>
									<p class={groupHeader}>Repositories</p>
									{suggestions.map((s) => renderItem(s, suggestions.indexOf(s)))}
								</div>
							)}
						</>
					)}
				</div>
			)}
		</div>
	)
}
