import { css } from '../../../styled-system/css'
import { createRoute } from 'honox/factory'
import SearchBox from '../../islands/search'

/**
 * Thread detail page — `/threads/:uuid`.
 *
 * Pure SSR, same pattern as the home page: the route reads the thread (with its
 * board + author joins) and its replies straight from the shared SQL client
 * (`c.env.sql`). Replies are ordered by `created_at` ascending; nested replies
 * (non-null `parentId`) are indented under their parent. A POST form appends a
 * new reply (or nested reply via the `parentId` field).
 */

type ThreadRow = {
	id: string
	title: string
	pinned: number
	locked: number
	created_at: string
	updated_at: string
	author_name: string | null
	board_name: string | null
	board_slug: string | null
}

type ReplyRow = {
	id: string
	parentId: string | null
	body: string
	created_at: string
	author_name: string | null
}

type HotThread = {
	id: string
	title: string
	reply_count: number
}

type Author = { id: string; name: string }

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

	let thread: ThreadRow | null = null
	let replies: ReplyRow[] = []
	let hot: HotThread[] = []
	let authors: Author[] = []

	try {
		const sql = c.env.sql
		if (sql) {
			const rows = (await sql.unsafe(
				`SELECT t.id, t.title, t.pinned, t.locked, t."created_at", t."updated_at",
				        u.name AS author_name,
				        b.name AS board_name, b.slug AS board_slug
				 FROM "threads" t
				 LEFT JOIN "users" u ON u.id = t."authorId"
				 LEFT JOIN "boards" b ON b.id = t."boardId"
				 WHERE t.id = ?
				 LIMIT 1`,
				[uuid],
			)) as ThreadRow[]
			thread = rows[0] ?? null

			replies = (await sql.unsafe(
				`SELECT r.id, r."parentId", r.body, r."created_at", u.name AS author_name
				 FROM "replies" r
				 LEFT JOIN "users" u ON u.id = r."authorId"
				 WHERE r."threadId" = ?
				 ORDER BY r."created_at" ASC, r.id ASC`,
				[uuid],
			)) as ReplyRow[]

			hot = (await sql.unsafe(
				`SELECT t.id, t.title, COUNT(r.id) AS reply_count
				 FROM "threads" t
				 LEFT JOIN "replies" r ON r."threadId" = t.id
				 GROUP BY t.id
				 ORDER BY reply_count DESC, t."updated_at" DESC
				 LIMIT 6`,
			)) as HotThread[]

			authors = (await sql.unsafe(
				`SELECT id, name FROM "users" ORDER BY "created_at" DESC LIMIT 20`,
			)) as Author[]
		}
	} catch {
		thread = null
		replies = []
		hot = []
		authors = []
	}

	// 404 when the thread doesn't exist (or the db is unavailable).
	if (!thread) {
		c.status(404)
		return c.render(
			<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, sans-serif' })}>
				<title>Thread not found · BBS</title>
				<Nav />
				<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 16, textAlign: 'center' })}>
					<h1 class={css({ fontSize: '2xl', fontWeight: 800 })}>Thread not found</h1>
					<p class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
						No thread with id <code>{uuid}</code>.
					</p>
					<a
						href="/"
						class={css({ display: 'inline-block', mt: 6, px: 4, py: 2, rounded: 'md', bg: 'accent', color: 'white', fontSize: 'sm', fontWeight: 600, textDecoration: 'none' })}
					>
						Back to forum
					</a>
				</main>
			</div>,
		)
	}

	const topLevel = replies.filter((r) => r.parentId === null)

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>{thread.title} · BBS</title>
			<Nav />

			<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 10 })}>
				{/* Breadcrumb */}
				<nav class={css({ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'sm', color: 'muted', mb: 6 })}>
					<a href="/" class={css({ color: 'muted', textDecoration: 'none', _hover: { color: 'accent' } })}>
						Home
					</a>
					<span aria-hidden>›</span>
					{thread.board_name ? (
						<span class={css({ color: 'ink', fontWeight: 500 })}>{thread.board_name}</span>
					) : (
						<span>Unknown board</span>
					)}
					<span aria-hidden>›</span>
					<span class={css({ color: 'faint', truncate: true, maxWidth: '20rem' })}>{thread.title}</span>
				</nav>

				<div class={css({ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 })}>
					{/* ---- main column ---- */}
					<div>
						{/* Thread header */}
						<article class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', p: 6 })}>
							<div class={css({ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' })}>
								{thread.pinned === 1 && (
									<span class={css({ px: 2, py: 0.5, rounded: 'full', bg: '#fef3c7', color: '#92400e', fontSize: 'xs', fontWeight: 600 })}>
										Pin
									</span>
								)}
								{thread.locked === 1 && (
									<span class={css({ px: 2, py: 0.5, rounded: 'full', bg: '#fee2e2', color: '#991b1b', fontSize: 'xs', fontWeight: 600 })}>
										Locked
									</span>
								)}
								{thread.board_slug && (
									<span class={css({ px: 2, py: 0.5, rounded: 'full', bg: '#fff7ed', color: '#c2410c', fontSize: 'xs', fontWeight: 500 })}>
										/{thread.board_slug}
									</span>
								)}
							</div>

							<h1 class={css({ mt: 3, fontSize: '2xl', fontWeight: 800, letterSpacing: '-0.01em' })}>
								{thread.title}
							</h1>

							<div class={css({ mt: 3, display: 'flex', alignItems: 'center', gap: 4, fontSize: 'xs', color: 'faint' })}>
								<span class={css({ display: 'flex', alignItems: 'center', gap: 1 })}>
									<span aria-hidden>👤</span>
									{thread.author_name ?? 'unknown'}
								</span>
								<span>
									Started {timeAgo(thread.created_at)}
								</span>
								<span>
									Updated {timeAgo(thread.updated_at)}
								</span>
								<span>{replies.length} replies</span>
								<a
									href={`/threads/${thread.id}/edit`}
									class={css({ display: 'flex', alignItems: 'center', gap: 1, color: 'muted', textDecoration: 'none', _hover: { color: 'accent' } })}
								>
									<span aria-hidden>✏️</span>
									Edit
								</a>
							</div>
						</article>

						{/* Replies */}
						<section class={css({ mt: 8 })}>
							<h2 class={css({ mb: 4, fontSize: 'lg', fontWeight: 700 })}>Replies ({replies.length})</h2>

							{topLevel.length > 0 ? (
								<div class={css({ spaceY: 3 })}>
									{topLevel.map((r) => (
										<ReplyCard key={r.id} reply={r} nested={replies.filter((x) => x.parentId === r.id)} />
									))}
								</div>
							) : (
								<p class={css({ py: 8, textAlign: 'center', fontSize: 'sm', color: 'faint' })}>
									No replies yet — be the first.
								</p>
							)}
						</section>

						{/* Reply form */}
						<section class={css({ mt: 8 })}>
							<h2 class={css({ mb: 4, fontSize: 'lg', fontWeight: 700 })}>Post a reply</h2>
							<form
								method="post"
								action={`/threads/${thread.id}`}
								class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', p: 5, spaceY: 3 })}
							>
								<input type="hidden" name="action" value="reply" />
								<input type="hidden" name="threadId" value={thread.id} />
								<select
									name="authorId"
									required
									class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', bg: 'white', outline: 'none', _focus: { borderColor: 'accent' } })}
								>
									<option value="">Author…</option>
									{authors.map((u) => (
										<option key={u.id} value={u.id}>
											{u.name}
										</option>
									))}
								</select>
								<textarea
									name="body"
									placeholder="Write your reply…"
									required
									rows={4}
									class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', outline: 'none', resize: 'vertical', _focus: { borderColor: 'accent' } })}
								/>
								<button
									type="submit"
									class={css({ px: 4, py: 2, rounded: 'md', bg: 'accent', color: 'white', fontSize: 'sm', fontWeight: 600, border: 'none', cursor: 'pointer', _hover: { bg: '#ea580c' } })}
								>
									Post reply
								</button>
							</form>
						</section>
					</div>

					{/* ---- sidebar ---- */}
					<aside class={css({ spaceY: 8 })}>
						<section>
							<h2 class={css({ mb: 4, fontSize: 'lg', fontWeight: 700 })}>Hot threads</h2>
							{hot.length > 0 ? (
								<div class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', p: 2 })}>
									{hot.map((t, i) => (
										<a
											key={t.id}
											href={`/threads/${t.id}`}
											class={css({ display: 'flex', gap: 3, alignItems: 'flex-start', px: 3, py: 3, rounded: 'lg', textDecoration: 'none', _hover: { bg: '#fafafa' } })}
										>
											<span
												class={css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', w: 5, h: 5, rounded: 'md', fontSize: 'xs', fontWeight: 700, bg: i < 3 ? 'accent' : '#f3f4f6', color: i < 3 ? 'white' : 'muted', flexShrink: 0 })}
											>
												{i + 1}
											</span>
											<div class={css({ minWidth: 0 })}>
												<div class={css({ fontSize: 'sm', fontWeight: 600, lineClamp: 2, color: 'ink' })}>{t.title}</div>
												<div class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>{t.reply_count} replies</div>
											</div>
										</a>
									))}
								</div>
							) : (
								<p class={css({ fontSize: 'sm', color: 'faint' })}>No hot threads yet.</p>
							)}
						</section>
					</aside>
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

/** A reply card — renders the body, author meta and any nested replies. */
function ReplyCard({ reply, nested }: { reply: ReplyRow; nested: ReplyRow[] }) {
	return (
		<div class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white' })}>
			<div class={css({ px: 5, py: 4 })}>
				<div class={css({ display: 'flex', alignItems: 'center', gap: 3, fontSize: 'xs', color: 'faint' })}>
					<span class={css({ display: 'flex', alignItems: 'center', gap: 1 })}>
						<span aria-hidden>👤</span>
						{reply.author_name ?? 'unknown'}
					</span>
					<span>{timeAgo(reply.created_at)}</span>
				</div>
				<p class={css({ mt: 2, fontSize: 'sm', lineHeight: 1.7, whiteSpace: 'pre-wrap' })}>{reply.body}</p>
			</div>

			{nested.length > 0 && (
				<div class={css({ ml: 6, borderTop: '1px solid token(colors.border)', borderLeft: '3px solid #fdba74', spaceY: 2, p: 3 })}>
					{nested.map((r) => (
						<div key={r.id} class={css({ px: 3, py: 3, rounded: 'lg', bg: '#fffaf5' })}>
							<div class={css({ display: 'flex', alignItems: 'center', gap: 3, fontSize: 'xs', color: 'faint' })}>
								<span>↳ {r.author_name ?? 'unknown'}</span>
								<span>{timeAgo(r.created_at)}</span>
							</div>
							<p class={css({ mt: 1.5, fontSize: 'sm', lineHeight: 1.6, whiteSpace: 'pre-wrap' })}>{r.body}</p>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

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
				<a href="/#boards" class={css({ fontSize: 'sm', color: 'muted', textDecoration: 'none', _hover: { color: 'ink' } })}>
					Boards
				</a>
				<a href="/#threads" class={css({ fontSize: 'sm', color: 'muted', textDecoration: 'none', _hover: { color: 'ink' } })}>
					Threads
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

/**
 * POST /threads/:uuid — handle the reply form. A `reply` action inserts a new
 * row into `replies` (nested when `parentId` is provided), then redirects back
 * to the thread. The author is resolved from the current `authorId` selection.
 */
export const POST = createRoute(async (c) => {
	const uuid = c.req.param('uuid')
	const sql = c.env.sql
	if (!sql) return c.redirect(`/threads/${uuid}`)

	const body = await c.req.parseBody()
	const action = typeof body.action === 'string' ? body.action : ''

	if (action === 'reply') {
		const threadId = typeof body.threadId === 'string' ? body.threadId : uuid
		const authorId = typeof body.authorId === 'string' ? body.authorId : ''
		const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null
		const replyBody = typeof body.body === 'string' ? body.body.trim() : ''

		// Without an author picker, fall back to the thread author for the demo.
		let resolvedAuthor = authorId
		if (!resolvedAuthor) {
			try {
				const rows = (await sql.unsafe(
					`SELECT "authorId" FROM "threads" WHERE "id" = ? LIMIT 1`,
					[threadId],
				)) as Array<{ authorId: string }>
				resolvedAuthor = rows[0]?.authorId ?? ''
			} catch {
				resolvedAuthor = ''
			}
		}

		if (threadId && replyBody && resolvedAuthor) {
			try {
				const id = crypto.randomUUID()
				const now = new Date().toISOString()
				await sql.unsafe(
					`INSERT INTO "replies" ("id","created_at","threadId","authorId","parentId","body") ` +
						`VALUES (?,?,?,?,?,?)`,
					[id, now, threadId, resolvedAuthor, parentId, replyBody],
				)
			} catch {
				// Drop the reply on failure; the redirect keeps the UX simple.
			}
		}
	}

	return c.redirect(`/threads/${uuid}`)
})
