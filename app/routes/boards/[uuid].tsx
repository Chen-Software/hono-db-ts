import { css } from '../../../styled-system/css'
import { createRoute } from 'honox/factory'
import SearchBox from '../../islands/search'

/**
 * Board detail page — `/boards/:uuid`.
 *
 * Pure SSR. Shows the board's header (name, slug, description, moderator) and
 * the threads inside it, with keyset pagination. A POST form creates a new
 * thread directly in this board (redirecting to the new thread's page).
 */

type BoardRow = {
	id: string
	name: string
	slug: string
	description: string
	moderator_name: string | null
	created_at: string
	thread_count: number
}

type ThreadRow = {
	id: string
	title: string
	pinned: number
	locked: number
	created_at: string
	updated_at: string
	author_name: string | null
	reply_count: number
}

type Author = { id: string; name: string }

type HotThread = {
	id: string
	title: string
	reply_count: number
}

const PAGE_SIZE = 20

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
	const cursor = c.req.query('cursor') ?? ''

	let board: BoardRow | null = null
	let threads: ThreadRow[] = []
	let total = 0
	let authors: Author[] = []
	let hot: HotThread[] = []

	try {
		const sql = c.env.sql
		if (sql) {
			const rows = (await sql.unsafe(
				`SELECT b.id, b.name, b.slug, b.description, b."created_at",
				        u.name AS moderator_name,
				        (SELECT COUNT(*) FROM "threads" t WHERE t."boardId" = b.id) AS thread_count
				 FROM "boards" b
				 LEFT JOIN "users" u ON u.id = b."moderatorId"
				 WHERE b.id = ?
				 LIMIT 1`,
				[uuid],
			)) as BoardRow[]
			board = rows[0] ?? null

			if (board) {
				const where = ['t."boardId" = ?']
				const params: unknown[] = [uuid]
				if (cursor) {
					where.push(`t."updated_at" < ?`)
					params.push(cursor)
				}
				const whereSql = `WHERE ${where.join(' AND ')}`

				const count = (await sql.unsafe(
					`SELECT COUNT(*) AS n FROM "threads" t ${whereSql}`,
					params,
				)) as Array<{ n: number }>
				total = count[0]?.n ?? 0

				threads = (await sql.unsafe(
					`SELECT t.id, t.title, t.pinned, t.locked, t."created_at", t."updated_at",
					        u.name AS author_name,
					        (SELECT COUNT(*) FROM "replies" r WHERE r."threadId" = t.id) AS reply_count
					 FROM "threads" t
					 LEFT JOIN "users" u ON u.id = t."authorId"
					 ${whereSql}
					 ORDER BY t.pinned DESC, t."updated_at" DESC
					 LIMIT ${PAGE_SIZE}`,
					params,
				)) as ThreadRow[]

				authors = (await sql.unsafe(
					`SELECT id, name FROM "users" ORDER BY "created_at" DESC LIMIT 20`,
				)) as Author[]

				hot = (await sql.unsafe(
					`SELECT t.id, t.title, COUNT(r.id) AS reply_count
					 FROM "threads" t
					 LEFT JOIN "replies" r ON r."threadId" = t.id
					 WHERE t."boardId" = ?
					 GROUP BY t.id
					 ORDER BY reply_count DESC, t."updated_at" DESC
					 LIMIT 6`,
					[uuid],
				)) as HotThread[]
			}
		}
	} catch {
		board = null
		threads = []
		total = 0
		authors = []
		hot = []
	}

	// 404 when the board doesn't exist.
	if (!board) {
		c.status(404)
		return c.render(
			<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, sans-serif' })}>
				<title>Board not found · BBS</title>
				<Nav />
				<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 16, textAlign: 'center' })}>
					<h1 class={css({ fontSize: '2xl', fontWeight: 800 })}>Board not found</h1>
					<p class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
						No board with id <code>{uuid}</code>.
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

	const nextCursor =
		threads.length === PAGE_SIZE ? threads[threads.length - 1].updated_at : null

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>{board.name} · BBS</title>
			<Nav />

			<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 10 })}>
				{/* Breadcrumb */}
				<nav class={css({ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'sm', color: 'muted', mb: 6 })}>
					<a href="/" class={css({ color: 'muted', textDecoration: 'none', _hover: { color: 'accent' } })}>
						Home
					</a>
					<span aria-hidden>›</span>
					<span class={css({ color: 'ink', fontWeight: 500 })}>{board.name}</span>
				</nav>

				<div class={css({ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 })}>
					{/* ---- main column ---- */}
					<div>
						{/* Board header */}
						<article class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', p: 6, mb: 8 })}>
							<div class={css({ display: 'flex', alignItems: 'center', gap: 3 })}>
								<span class={css({ w: 3, h: 3, rounded: 'full', bg: 'accent' })} />
								<span class={css({ px: 2, py: 0.5, rounded: 'full', bg: '#fff7ed', color: '#c2410c', fontSize: 'xs', fontWeight: 500 })}>
									/{board.slug}
								</span>
							</div>
							<h1 class={css({ mt: 3, fontSize: '2xl', fontWeight: 800, letterSpacing: '-0.01em' })}>
								{board.name}
							</h1>
							<p class={css({ mt: 2, maxWidth: 'xl', fontSize: 'sm', color: 'muted', lineHeight: 1.6 })}>
								{board.description}
							</p>
							<div class={css({ mt: 4, display: 'flex', alignItems: 'center', gap: 5, fontSize: 'xs', color: 'faint' })}>
								<span class={css({ display: 'flex', alignItems: 'center', gap: 1 })}>
									<span aria-hidden>👤</span>
									Moderator: {board.moderator_name ?? 'unknown'}
								</span>
								<span>{board.thread_count} threads</span>
								<span>Created {timeAgo(board.created_at)}</span>
								<a
									href={`/boards/${board.id}/edit`}
									class={css({ display: 'flex', alignItems: 'center', gap: 1, color: 'muted', textDecoration: 'none', _hover: { color: 'accent' } })}
								>
									<span aria-hidden>✏️</span>
									Edit
								</a>
							</div>
						</article>

						{/* New thread form */}
						<section class={css({ mb: 8 })}>
							<h2 class={css({ mb: 4, fontSize: 'lg', fontWeight: 700 })}>New thread</h2>
							<form
								method="post"
								action={`/boards/${board.id}`}
								class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', p: 5, spaceY: 3 })}
							>
								<input type="hidden" name="action" value="create-thread" />
								<input type="hidden" name="boardId" value={board.id} />
								<input
									name="title"
									placeholder="Thread title…"
									required
									maxLength={300}
									class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
								/>
								<div class={css({ display: 'flex', gap: 3, alignItems: 'center' })}>
									<select
										name="authorId"
										required
										class={css({ flex: 1, px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', bg: 'white', outline: 'none', _focus: { borderColor: 'accent' } })}
									>
										<option value="">Author…</option>
										{authors.map((u) => (
											<option key={u.id} value={u.id}>
												{u.name}
											</option>
										))}
									</select>
									<button
										type="submit"
										class={css({ px: 4, py: 2, rounded: 'md', bg: 'accent', color: 'white', fontSize: 'sm', fontWeight: 600, border: 'none', cursor: 'pointer', _hover: { bg: '#ea580c' } })}
									>
										Post thread
									</button>
								</div>
							</form>
						</section>

						{/* Threads in this board */}
						<section>
							<div class={css({ mb: 4, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' })}>
								<h2 class={css({ fontSize: 'lg', fontWeight: 700 })}>Threads</h2>
								<span class={css({ fontSize: 'sm', color: 'faint' })}>{total} total</span>
							</div>

							{threads.length > 0 ? (
								<div class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', overflow: 'hidden' })}>
									{threads.map((t, i) => (
										<a
											key={t.id}
											href={`/threads/${t.id}`}
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
													{t.pinned === 1 && (
														<span class={css({ px: 1.5, py: 0.5, rounded: 'full', bg: '#fef3c7', color: '#92400e', fontSize: 'xs', fontWeight: 600 })}>
															Pin
														</span>
													)}
													{t.locked === 1 && (
														<span class={css({ px: 1.5, py: 0.5, rounded: 'full', bg: '#fee2e2', color: '#991b1b', fontSize: 'xs', fontWeight: 600 })}>
															Locked
														</span>
													)}
													<span class={css({ fontWeight: 600, fontSize: 'sm', lineClamp: 1 })}>{t.title}</span>
												</div>
												<div class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>
													{t.author_name ?? 'unknown'} · {timeAgo(t.updated_at)}
												</div>
											</div>
											<div class={css({ display: 'flex', alignItems: 'center', gap: 1.5, fontSize: 'sm', color: 'muted', flexShrink: 0 })}>
												<span aria-hidden>💬</span>
												{t.reply_count}
											</div>
										</a>
									))}
								</div>
							) : (
								<p class={css({ py: 10, textAlign: 'center', fontSize: 'sm', color: 'faint' })}>
									No threads in this board yet.
								</p>
							)}

							{/* Pagination */}
							<div class={css({ mt: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}>
								{cursor ? (
									<a href={`/boards/${board.id}`} class={css({ fontSize: 'sm', color: 'accent', textDecoration: 'none' })}>
										← Newer
									</a>
								) : (
									<span />
								)}
								{nextCursor && (
									<a
										href={`/boards/${board.id}?cursor=${encodeURIComponent(nextCursor)}`}
										class={css({ fontSize: 'sm', color: 'accent', textDecoration: 'none' })}
									>
										Older →
									</a>
								)}
							</div>
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
				<a href="/threads" class={css({ fontSize: 'sm', color: 'muted', textDecoration: 'none', _hover: { color: 'ink' } })}>
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
 * POST /boards/:uuid — handle the "new thread in this board" form.
 */
export const POST = createRoute(async (c) => {
	const uuid = c.req.param('uuid')
	const sql = c.env.sql
	if (!sql) return c.redirect(`/boards/${uuid}`)

	const body = await c.req.parseBody()
	if (body.action === 'create-thread') {
		const title = typeof body.title === 'string' ? body.title.trim() : ''
		const boardId = typeof body.boardId === 'string' ? body.boardId : uuid
		const authorId = typeof body.authorId === 'string' ? body.authorId : ''

		if (title && boardId && authorId) {
			try {
				const id = crypto.randomUUID()
				const now = new Date().toISOString()
				await sql.unsafe(
					`INSERT INTO "threads" ("id","created_at","updated_at","boardId","authorId","title","pinned","locked") ` +
						`VALUES (?,?,?,?,?,?,0,0)`,
					[id, now, now, boardId, authorId, title],
				)
				return c.redirect(`/threads/${id}`)
			} catch {
				return c.redirect(`/boards/${uuid}`)
			}
		}
	}

	return c.redirect(`/boards/${uuid}`)
})
