import { css } from '../../styled-system/css'
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
export default function SearchBox() {
	const [q, setQ] = useState('')
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
					placeholder="Search threads &amp; posts…"
					class={css({
						w: 56,
						px: 3,
						py: 2,
						rounded: 'md',
						border: '1px solid token(colors.border)',
						fontSize: 'sm',
						bg: '#fafafa',
						outline: 'none',
						_focus: { borderColor: 'accent', bg: 'white' },
					})}
				/>
				<button
					onClick={() => run()}
					class={css({
						px: 3,
						py: 2,
						rounded: 'md',
						bg: 'ink',
						color: 'white',
						fontSize: 'sm',
						fontWeight: 600,
						cursor: 'pointer',
						_hover: { bg: '#1f2937' },
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
						bg: 'white',
						boxShadow: '0 12px 32px rgba(17,24,39,0.15)',
						p: 2,
						zIndex: 20,
					})}
				>
					{error ? (
						<p class={css({ px: 3, py: 2, fontSize: 'sm', color: '#991b1b' })}>{error}</p>
					) : (
						<>
							{result && result.threads.length === 0 && result.posts.length === 0 && (
								<p class={css({ px: 3, py: 2, fontSize: 'sm', color: 'faint' })}>No results.</p>
							)}
							{result && result.threads.length > 0 && (
								<div>
									<div class={css({ px: 3, pt: 2, pb: 1, fontSize: 'xs', fontWeight: 700, color: 'faint', textTransform: 'uppercase', letterSpacing: '0.05em' })}>
										Threads
									</div>
									{result.threads.map((t) => (
										<a
											key={t.id}
											href={`/api/threads/${t.id}`}
											class={css({ display: 'block', px: 3, py: 2, rounded: 'md', fontSize: 'sm', fontWeight: 600, color: 'ink', textDecoration: 'none', _hover: { bg: '#fafafa' } })}
										>
											{t.title}
										</a>
									))}
								</div>
							)}
							{result && result.posts.length > 0 && (
								<div>
									<div class={css({ px: 3, pt: 2, pb: 1, fontSize: 'xs', fontWeight: 700, color: 'faint', textTransform: 'uppercase', letterSpacing: '0.05em' })}>
										Posts
									</div>
									{result.posts.map((p) => (
										<a
											key={p.id}
											href={`/api/posts/${p.id}`}
											class={css({ display: 'block', px: 3, py: 2, rounded: 'md', fontSize: 'sm', color: 'ink', textDecoration: 'none', _hover: { bg: '#fafafa' } })}
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
