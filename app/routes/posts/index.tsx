import { css } from '../../../styled-system/css'
import { createRoute } from 'honox/factory'
import SearchBox from '../../islands/search'

/**
 * Posts list page — `/posts`.
 *
 * Pure SSR. Lists posts (published by default, newest first) with optional
 * `?published=0` to include drafts and keyset pagination on `updated_at`.
 * Every post links to its detail page `/posts/:uuid`.
 */

type PostRow = {
	id: string
	title: string
	published: number
	updated_at: string
	author_name: string | null
}

const PAGE_SIZE = 25

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

export default createRoute(async (c) => {
	const sql = c.env.sql
	const published = c.req.query('published') // '1' | '0' | undefined
	const cursor = c.req.query('cursor') ?? ''

	let posts: PostRow[] = []
	let total = 0

	try {
		if (sql) {
			const where: string[] = []
			const params: unknown[] = []
			if (published === '1') where.push(`p."published" = 1`)
			else if (published === '0') where.push(`p."published" = 0`)
			else where.push(`p."published" = 1`) // default: published only
			if (cursor) {
				where.push(`p."updated_at" < ?`)
				params.push(cursor)
			}
			const whereSql = `WHERE ${where.join(' AND ')}`

			const count = (await sql.unsafe(
				`SELECT COUNT(*) AS n FROM "posts" p ${whereSql}`,
				params,
			)) as Array<{ n: number }>
			total = count[0]?.n ?? 0

			posts = (await sql.unsafe(
				`SELECT p.id, p.title, p.published, p."updated_at", u.name AS author_name
				 FROM "posts" p
				 LEFT JOIN "users" u ON u.id = p."authorId"
				 ${whereSql}
				 ORDER BY p."updated_at" DESC
				 LIMIT ${PAGE_SIZE}`,
				params,
			)) as PostRow[]
		}
	} catch {
		posts = []
		total = 0
	}

	const nextCursor = posts.length === PAGE_SIZE ? posts[posts.length - 1].updated_at : null
	const basePath = `/posts${published ? `?published=${published}` : ''}`

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>Posts · BBS</title>
			<Nav />

			<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 10 })}>
				{/* Heading */}
				<div class={css({ mb: 8, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 })}>
					<div>
						<p class={css({ fontSize: 'xs', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'accent' })}>
							Content-addressed articles
						</p>
						<h1 class={css({ mt: 1, fontSize: '2xl', fontWeight: 800 })}>Posts</h1>
						<p class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
							{total.toLocaleString()} {published === '0' ? 'draft' : 'published'} post{total === 1 ? '' : 's'}
						</p>
					</div>
					<div class={css({ display: 'flex', gap: 2 })}>
						<a
							href="/posts"
							class={css({ px: 3, py: 2, rounded: 'md', border: published === '1' || !published ? '1px solid token(colors.border)' : '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', color: 'muted', textDecoration: 'none' })}
						>
							Published
						</a>
						<a
							href="/posts?published=0"
							class={css({ px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', color: 'muted', textDecoration: 'none' })}
						>
							Drafts
						</a>
					</div>
				</div>

				{/* Post list */}
				{posts.length > 0 ? (
					<div class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', overflow: 'hidden' })}>
						{posts.map((p, i) => (
							<a
								key={p.id}
								href={`/posts/${p.id}`}
								class={css({
									display: 'flex',
									alignItems: 'center',
									gap: 4,
									px: 5,
									py: 4,
									textDecoration: 'none',
									color: 'ink',
									borderTop: i === 0 ? 'none' : '1px solid token(colors.border)',
									_hover: { bg: '#fafafa' },
								})}
							>
								<div class={css({ flex: 1, minWidth: 0 })}>
									<div class={css({ display: 'flex', alignItems: 'center', gap: 2 })}>
										{p.published === 0 && (
											<span class={css({ px: 1.5, py: 0.5, rounded: 'full', bg: '#f3f4f6', color: '#6b7280', fontSize: 'xs', fontWeight: 600 })}>
												Draft
											</span>
										)}
										<span class={css({ fontWeight: 600, fontSize: 'sm', lineClamp: 1 })}>{p.title}</span>
									</div>
									<div class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>
										{p.author_name ?? 'unknown'}
									</div>
								</div>
								<div class={css({ fontSize: 'xs', color: 'faint', flexShrink: 0, whiteSpace: 'nowrap' })}>
									{timeAgo(p.updated_at)}
								</div>
							</a>
						))}
					</div>
				) : (
					<div class={css({ py: 16, textAlign: 'center', rounded: 'xl', border: '1px dashed token(colors.border)', bg: 'white' })}>
						<p class={css({ fontSize: 'sm', color: 'muted' })}>No posts yet.</p>
					</div>
				)}

				{/* Pagination */}
				<div class={css({ mt: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}>
					{cursor ? (
						<a href={basePath} class={css({ fontSize: 'sm', color: 'accent', textDecoration: 'none' })}>
							← Newer
						</a>
					) : (
						<span />
					)}
					{nextCursor && (
						<a
							href={`${basePath}${basePath.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(nextCursor)}`}
							class={css({ fontSize: 'sm', color: 'accent', textDecoration: 'none' })}
						>
							Older →
						</a>
					)}
				</div>
			</main>

			<footer class={css({ mt: 4, borderTop: '1px solid token(colors.border)', bg: 'white', px: 6, py: 8 })}>
				<div class={css({ maxWidth: '6xl', mx: 'auto', fontSize: 'sm', color: 'muted' })}>
					<span class={css({ fontWeight: 700, color: 'ink' })}>BBS Forum</span> — model-driven community demo.
				</div>
			</footer>
		</div>,
	)
})

/** Shared top navigation — mirrors the home page's header. */
function Nav() {
	return (
		<header
			class={css({
				position: 'sticky',
				top: 0,
				zIndex: 10,
				display: 'flex',
				alignItems: 'center',
				gap: 6,
				px: 6,
				h: 16,
				bg: 'white',
				borderBottom: '1px solid token(colors.border)',
			})}
		>
			<a
				href="/"
				class={css({ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 800, fontSize: 'lg', textDecoration: 'none', color: 'ink' })}
			>
				<span class={css({ display: 'inline-block', w: 3, h: 3, rounded: 'sm', bg: 'accent' })} />
				BBS Forum
			</a>

			<nav class={css({ display: 'flex', gap: 4, ml: 4 })}>
				<a href="/boards" class={css({ fontSize: 'sm', color: 'muted', textDecoration: 'none', _hover: { color: 'ink' } })}>
					Boards
				</a>
				<a href="/threads" class={css({ fontSize: 'sm', color: 'muted', textDecoration: 'none', _hover: { color: 'ink' } })}>
					Threads
				</a>
				<a href="/posts" class={css({ fontSize: 'sm', fontWeight: 700, color: 'ink', textDecoration: 'none' })}>
					Posts
				</a>
			</nav>

			<div class={css({ display: 'flex', alignItems: 'center', gap: 3, ml: 'auto' })}>
				<SearchBox />
				<a
					href="/#new-thread"
					class={css({ px: 4, py: 2, rounded: 'md', bg: 'accent', color: 'white', fontSize: 'sm', fontWeight: 600, textDecoration: 'none', _hover: { bg: '#ea580c' } })}
				>
					New thread
				</a>
			</div>
		</header>
	)
}
