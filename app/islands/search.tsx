import { css } from '../../design-system/css'
import { useState } from 'hono/jsx'

type SearchResult = {
	threads: Array<{ id: string; title: string; boardId: string; authorId: string; updated_at: string }>
	posts: Array<{ id: string; title: string; authorId: string; updated_at: string }>
}

/**
 * SearchBox — a client-side island that queries the JSON API (`/api/search?q=`)
 * and renders the matching threads + posts inline. The API is served by the
 * same app (`app/server.ts` mounts `buildQueryApp` under `/api`), so this works
 * whether the page is served by `bun run src/main.ts serve` or the UI dev
 * server.
 */
type SearchBoxProps = {
	placeholder?: string
	initialQuery?: string
}

export default function SearchBox({
	placeholder = 'Search threads & posts…',
	initialQuery = '',
}: SearchBoxProps) {
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

	return (
		<div class={css({ position: 'relative' })}>
			<div class={css({ display: 'flex', gap: 2 })}>
				<input
					value={q}
					onInput={(e) => setQ((e.target as HTMLInputElement).value)}
					onKeyDown={(e) => e.key === 'Enter' && run()}
					placeholder={placeholder}
					class={css({
						w: 56,
						px: 3,
						py: 2,
						rounded: 'md',
						border: '1px solid token(colors.border)',
						fontSize: 'sm',
						bg: 'canvas',
						color: 'fg.default',
						outline: 'none',
						_focus: { borderColor: 'colorPalette.solid.bg', bg: 'canvas' },
					})}
					/>
					<button
					onClick={() => run()}
					class={css({
						px: 3,
						py: 2,
						rounded: 'md',
						bg: 'colorPalette.solid.bg',
						color: 'colorPalette.solid.fg',
						fontSize: 'sm',
						fontWeight: 600,
						cursor: 'pointer',
						_hover: { bg: 'colorPalette.solid.bg.hover' },
					})}
					>
					Search
				</button>
			</div>

			{(result || error) && (
				<div
					class={css({
						position: 'absolute',
						top: 'calc(100% + 8px)',
						right: 0,
						w: 96,
						maxHeight: '24rem',
						overflowY: 'auto',
						rounded: 'lg',
						border: '1px solid token(colors.border)',
						bg: 'colorPalette.surface.bg',
						color: 'fg.default',
						boxShadow: '0 12px 32px rgba(17,24,39,0.15)',
						p: 2,
						zIndex: 20,
						})}
						>
						{error ? (
						<p class={css({ px: 3, py: 2, fontSize: 'sm', color: 'fg.error' })}>{error}</p>
						) : (
						<>
							{result && result.threads.length === 0 && result.posts.length === 0 && (
								<p class={css({ px: 3, py: 2, fontSize: 'sm', color: 'fg.subtle' })}>No results.</p>
							)}
							{result && result.threads.length > 0 && (
								<div>
									<div class={css({ px: 3, pt: 2, pb: 1, fontSize: 'xs', fontWeight: 700, color: 'fg.subtle', textTransform: 'uppercase', letterSpacing: '0.05em' })}>
										Threads
									</div>
									{result.threads.map((t) => (
										<a
											key={t.id}
											href={`/threads/${t.id}`}
											class={css({ display: 'block', px: 3, py: 2, rounded: 'md', fontSize: 'sm', fontWeight: 600, color: 'fg.default', textDecoration: 'none', _hover: { bg: 'colorPalette.subtle.bg.hover' } })}
										>
											{t.title}
										</a>
									))}
								</div>
							)}
							{result && result.posts.length > 0 && (
								<div>
									<div class={css({ px: 3, pt: 2, pb: 1, fontSize: 'xs', fontWeight: 700, color: 'fg.subtle', textTransform: 'uppercase', letterSpacing: '0.05em' })}>
										Posts
									</div>
									{result.posts.map((p) => (
										<a
											key={p.id}
											href={`/posts/${p.id}`}
											class={css({ display: 'block', px: 3, py: 2, rounded: 'md', fontSize: 'sm', color: 'fg.default', textDecoration: 'none', _hover: { bg: 'colorPalette.subtle.bg.hover' } })}
										>
											{p.title}
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
