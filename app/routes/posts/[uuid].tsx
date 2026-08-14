import { css } from '../../../styled-system/css'
import { createRoute } from 'honox/factory'
import { hashContent } from '../../../src/capacities/hashable'
import SearchBox from '../../islands/search'

/**
 * Post detail page — `/posts/:uuid`.
 *
 * Pure SSR. Shows a post (title, author, published state, body) and its
 * content address: the stored `contentHash` is shown alongside a LIVE
 * recomputation (sha256 of `body`), so a tampered / stale hash is surfaced
 * right on the page — the content-addressing integrity guarantee made visible.
 */

type PostRow = {
	id: string
	title: string
	body: string
	published: number
	contentHash: string
	created_at: string
	updated_at: string
	author_name: string | null
	author_email: string | null
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

export default createRoute(async (c) => {
	const uuid = c.req.param('uuid')

	let post: PostRow | null = null

	try {
		const sql = c.env.sql
		if (sql) {
			const rows = (await sql.unsafe(
				`SELECT p.id, p.title, p.body, p.published, p."contentHash", p."created_at", p."updated_at",
				        u.name AS author_name, u.email AS author_email
				 FROM "posts" p
				 LEFT JOIN "users" u ON u.id = p."authorId"
				 WHERE p.id = ?
				 LIMIT 1`,
				[uuid],
			)) as PostRow[]
			post = rows[0] ?? null
		}
	} catch {
		post = null
	}

	if (!post) {
		c.status(404)
		return c.render(
			<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, sans-serif' })}>
				<title>Post not found · BBS</title>
				<Nav />
				<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 16, textAlign: 'center' })}>
					<h1 class={css({ fontSize: '2xl', fontWeight: 800 })}>Post not found</h1>
					<p class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
						No post with id <code>{uuid}</code>.
					</p>
					<a
						href="/posts"
						class={css({ display: 'inline-block', mt: 6, px: 4, py: 2, rounded: 'md', bg: 'accent', color: 'white', fontSize: 'sm', fontWeight: 600, textDecoration: 'none' })}
					>
						Back to posts
					</a>
				</main>
			</div>,
		)
	}

	// Content addressing: live integrity check — recompute sha256(body) and
	// compare with the stored hash.
	const computedHash = hashContent(post.body)
	const intact = computedHash === post.contentHash

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>{post.title} · BBS</title>
			<Nav />

			<main class={css({ maxWidth: '3xl', mx: 'auto', px: 6, py: 10 })}>
				{/* Breadcrumb */}
				<nav class={css({ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'sm', color: 'muted', mb: 6 })}>
					<a href="/posts" class={css({ color: 'muted', textDecoration: 'none', _hover: { color: 'accent' } })}>
						Posts
					</a>
					<span aria-hidden>›</span>
					<span class={css({ color: 'faint', truncate: true, maxWidth: '20rem' })}>{post.title}</span>
				</nav>

				{/* Post */}
				<article class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', p: 8 })}>
					{/* Meta row */}
					<div class={css({ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' })}>
						{post.published === 0 ? (
							<span class={css({ px: 2, py: 0.5, rounded: 'full', bg: '#f3f4f6', color: '#6b7280', fontSize: 'xs', fontWeight: 600 })}>
								Draft
							</span>
						) : (
							<span class={css({ px: 2, py: 0.5, rounded: 'full', bg: '#d1fae5', color: '#065f46', fontSize: 'xs', fontWeight: 600 })}>
								Published
							</span>
						)}
						<span class={css({ fontSize: 'xs', color: 'faint' })}>
							{post.author_name ?? 'unknown'} {post.author_email ? `· ${post.author_email}` : ''}
						</span>
						<span class={css({ fontSize: 'xs', color: 'faint' })}>Updated {timeAgo(post.updated_at)}</span>
						<a
							href={`/posts/${post.id}/edit`}
							class={css({ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1, fontSize: 'xs', color: 'muted', textDecoration: 'none', _hover: { color: 'accent' } })}
						>
							<span aria-hidden>✏️</span>
							Edit
						</a>
					</div>

					<h1 class={css({ mt: 4, fontSize: '3xl', fontWeight: 800, letterSpacing: '-0.02em' })}>
						{post.title}
					</h1>

					<div class={css({ mt: 6, borderTop: '1px solid token(colors.border)', pt: 6 })}>
						<p class={css({ fontSize: 'md', lineHeight: 1.8, whiteSpace: 'pre-wrap' })}>{post.body}</p>
					</div>

					{/* Content address (integrity) */}
					<div
						class={css({
							mt: 8,
							rounded: 'lg',
							border: `1px solid ${intact ? 'token(colors.border)' : '#fecaca'}`,
							bg: intact ? '#fafafa' : '#fef2f2',
							px: 4,
							py: 3,
							fontSize: 'xs',
							color: 'muted',
						})}
					>
						<div class={css({ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 600, color: 'ink' })}>
							<span aria-hidden>{intact ? '🔗' : '⚠️'}</span>
							Content address
							{intact ? (
								<span class={css({ px: 1.5, py: 0.5, rounded: 'full', bg: '#d1fae5', color: '#065f46', fontWeight: 600 })}>
									verified
								</span>
							) : (
								<span class={css({ px: 1.5, py: 0.5, rounded: 'full', bg: '#fee2e2', color: '#991b1b', fontWeight: 600 })}>
									hash mismatch
								</span>
							)}
						</div>
						<div class={css({ mt: 2, fontFamily: 'monospace', color: 'faint', wordBreak: 'break-all' })}>
							stored sha256: {post.contentHash}
						</div>
						<div class={css({ mt: 1, fontFamily: 'monospace', color: 'faint', wordBreak: 'break-all' })}>
							computed sha256: {computedHash}
						</div>
					</div>
				</article>
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
				<a href="/posts" class={css({ fontSize: 'sm', color: 'muted', textDecoration: 'none', _hover: { color: 'ink' } })}>
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
