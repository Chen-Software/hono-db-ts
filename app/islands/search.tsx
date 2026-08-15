import { cx, css } from '../../design-system/css'
import { search } from '../../design-system/recipes'
import { CloseIcon } from '../icons/close'
import { SearchIcon } from '../icons/search'
import { useState } from 'hono/jsx'

type SearchResult = {
	threads: Array<{ id: string; title: string; boardId: string; authorId: string; updated_at: string }>
	posts: Array<{ id: string; title: string; authorId: string; updated_at: string }>
}

export type SearchBoxProps = {
	placeholder?: string
	initialQuery?: string
	size?: 'sm' | 'md' | 'lg'
	variant?: 'outline' | 'surface' | 'subtle'
	class?: string
	style?: any
}

/**
 * SearchBox — a client-side island that queries the JSON API (`/api/search?q=`)
 * and renders the matching threads + posts inline. The API is served by the
 * same app (`app/server.ts` mounts `buildQueryApp` under `/api`), so this works
 * whether the page is served by `bun run src/main.ts serve` or the UI dev
 * server.
 *
 * Styling comes from the `search` slot recipe (the same one powering the
 * static `SearchBase` form), so the hydrated island and the no-JS fallback
 * share size/variant semantics and look. `size`/`variant` are split out as
 * recipe variants; everything else is forwarded from the `Search` wrapper.
 */
export default function SearchBox(props: SearchBoxProps) {
	const [variantProps, localProps] = search.splitVariantProps(props)
	const {
		placeholder = 'Search threads & posts…',
		initialQuery = '',
		class: classProp,
		style,
	} = localProps
	const styles = search(variantProps)

	const [q, setQ] = useState(initialQuery)
	const [result, setResult] = useState<SearchResult | null>(null)
	const [error, setError] = useState<string | null>(null)

	const run = async () => {
		if (!q.trim()) {
			setResult(null)
			setError(null)
			return
		}
		setError(null)
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
			if (!res.ok) throw new Error(`search failed (${res.status})`)
			const body = (await res.json()) as { ok: boolean; data: SearchResult }
			setResult(body.data)
		} catch (e) {
			setError((e as Error).message)
			setResult(null)
		}
	}

	const clear = () => {
		setQ('')
		setResult(null)
		setError(null)
	}

	const showListbox = result !== null || error !== null

	return (
		<div class={cx(styles.root, classProp)} style={style}>
			<div class={styles.inputWrap}>
				<div class={styles.icon}>
					<SearchIcon width="20" height="20" />
				</div>
				<input
					type="text"
					value={q}
					onInput={(e) => setQ((e.target as HTMLInputElement).value)}
					onKeyDown={(e) => e.key === 'Enter' && run()}
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

			{showListbox && (
				<div class={styles.listbox}>
					{error ? (
						<p class={styles.status}>{error}</p>
					) : (
						<>
							{result && result.threads.length === 0 && result.posts.length === 0 && (
								<p class={styles.status}>No results.</p>
							)}
							{result && result.threads.length > 0 && (
								<div>
									<p class={cx(styles.countText, css({ px: 3, pt: 2, pb: 1 }))}>
										Threads
									</p>
									{result.threads.map((t) => (
										<a key={t.id} href={`/threads/${t.id}`} class={styles.item}>
											<span class={styles.itemTitle}>{t.title}</span>
										</a>
									))}
								</div>
							)}
							{result && result.posts.length > 0 && (
								<div>
									<p class={cx(styles.countText, css({ px: 3, pt: 2, pb: 1 }))}>
										Posts
									</p>
									{result.posts.map((p) => (
										<a key={p.id} href={`/posts/${p.id}`} class={styles.item}>
											<span class={styles.itemTitle}>{p.title}</span>
										</a>
									))}
								</div>
							)}
						</>
					)}
				</div>
			)}
		</div>
	)
}
