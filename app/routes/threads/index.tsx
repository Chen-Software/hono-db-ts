import { css } from '../../../styled-system/css'
import { createRoute } from 'honox/factory'
import SearchBox from '../../islands/search'

/**
 * Threads list page — `/threads`.
 *
 * Pure SSR. Lists threads (newest / pinned-first, matching the home page) with
 * optional `?board=` and `?locked=` filters and keyset cursor pagination
 * (`?cursor=<updated_at>`). Every thread links to its detail page
 * `/threads/:uuid`. The board filter is a plain GET form, so no JS is needed.
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
	reply_count: number
}

type Board = { id: string; name: string }

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

	const boardFilter = c.req.query('board') ?? ''
	const lockedFilter = c.req.query('locked') // '1' | '0' | undefined
	const cursor = c.req.query('cursor') ?? ''

	let threads: ThreadRow[] = []
	let boards: Board[] = []
	let total = 0

	try {
		if (sql) {
			// Build the filter clause once (params bound below).
			const where: string[] = []
			const params: unknown[] = []
			if (boardFilter) {
				where.push(`t."boardId" = ?`)
				params.push(boardFilter)
			}
			if (lockedFilter === '1') where.push(`t."locked" = 1`)
			else if (lockedFilter === '0') where.push(`t."locked" = 0`)
			if (cursor) {
				where.push(`t."updated_at" < ?`)
				params.push(cursor)
			}
			const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

			const count = (await sql.unsafe(
				`SELECT COUNT(*) AS n FROM "threads" t ${whereSql}`,
				params,
			)) as Array<{ n: number }>
			total = count[0]?.n ?? 0

			threads = (await sql.unsafe(
				`SELECT t.id, t.title, t.pinned, t.locked, t."created_at", t."updated_at",
				        u.name AS author_name,
				        b.name AS board_name,
				        (SELECT COUNT(*) FROM "replies" r WHERE r."threadId" = t.id) AS reply_count
				 FROM "threads" t
				 LEFT JOIN "users" u ON u.id = t."authorId"
				 LEFT JOIN "boards" b ON b.id = t."boardId"
				 ${whereSql}
				 ORDER BY t.pinned DESC, t."updated_at" DESC
				 LIMIT ${PAGE_SIZE}`,
				params,
			)) as ThreadRow[]

			boards = (await sql.unsafe(
				`SELECT id, name FROM "boards" ORDER BY "created_at" DESC LIMIT 50`,
			)) as Board[]
		}
	} catch {
		threads = []
		boards = []
		total = 0
	}

	const nextCursor =
		threads.length === PAGE_SIZE ? threads[threads.length - 1].updated_at : null
	const basePath = `/threads?board=${encodeURIComponent(boardFilter)}` +
		(lockedFilter ? `&locked=${lockedFilter}` : '')

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>Threads · BBS</title>
			<Nav />

			<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 10 })}>
				{/* Heading */}
				<div class={css({ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, mb: 6 })}>
					<div>
						<p class={css({ fontSize: 'xs', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'accent' })}>
							All discussions
						</p>
						<h1 class={css({ mt: 1, fontSize: '2xl', fontWeight: 800 })}>Threads</h1>
						<p class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
							{total.toLocaleString()} thread{total === 1 ? '' : 's'}
							{boardFilter ? ' in this board' : ''}
						</p>
					</div>
					<a
						href="/#new-thread"
						class={css({ px: 4, py: 2, rounded: 'md', bg: 'accent', color: 'white', fontSize: 'sm', fontWeight: 600, textDecoration: 'none', _hover: { bg: '#ea580c' } })}
					>
						New thread
					</a>
				</div>

				{/* Filters */}
				<form
					method="get"
					action="/threads"
					class={css({ mb: 6, display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' })}
				>
					<select
						name="board"
						value={boardFilter}
						class={css({ px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
					>
						<option value="">All boards</option>
						{boards.map((b) => (
							<option key={b.id} value={b.id}>
								{b.name}
							</option>
						))}
					</select>

					<select
						name="locked"
						value={lockedFilter ?? ''}
						class={css({ px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
					>
						<option value="">Any status</option>
						<option value="1">Locked</option>
						<option value="0">Open</option>
					</select>

					<button
						type="submit"
						class={css({ px: 4, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', fontWeight: 500, cursor: 'pointer', _hover: { bg: '#fafafa' } })}
					>
						Filter
					</button>
					{(boardFilter || lockedFilter) && (
						<a href="/threads" class={css({ fontSize: 'sm', color: 'muted', textDecoration: 'none', _hover: { color: 'accent' } })}>
							Clear
						</a>
					)}
				</form>

				{/* Thread list */}
				{threads.length > 0 ? (
					<div class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', overflow: 'hidden' })}>
						{/* Table header */}
						<div
							class={css({
								display: 'grid',
								gridTemplateColumns: '1fr 12rem 5rem 5rem',
								gap: 4,
								px: 5,
								py: 3,
								borderBottom: '1px solid token(colors.border)',
								bg: '#fafafa',
								fontSize: 'xs',
								fontWeight: 600,
								color: 'faint',
								textTransform: 'uppercase',
								letterSpacing: '0.04em',
							})}
						>
							<span>Topic</span>
							<span>Board</span>
							<span class={css({ textAlign: 'center' })}>Replies</span>
							<span class={css({ textAlign: 'right' })}>Activity</span>
						</div>

						{threads.map((t, i) => (
							<a
								key={t.id}
								href={`/threads/${t.id}`}
								class={css({
									display: 'grid',
									gridTemplateColumns: '1fr 12rem 5rem 5rem',
									gap: 4,
									alignItems: 'center',
									px: 5,
									py: 4,
									textDecoration: 'none',
									color: 'ink',
									borderTop: i === 0 ? 'none' : '1px solid token(colors.border)',
									_hover: { bg: '#fafafa' },
								})}
							>
								<div class={css({ minWidth: 0 })}>
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
										{t.author_name ?? 'unknown'}
									</div>
								</div>

								<div class={css({ fontSize: 'sm', color: 'muted', truncate: true })}>
									{t.board_name ?? '—'}
								</div>

								<div class={css({ fontSize: 'sm', color: 'muted', textAlign: 'center' })}>
									{t.reply_count}
								</div>

								<div class={css({ fontSize: 'xs', color: 'faint', textAlign: 'right', whiteSpace: 'nowrap' })}>
									{timeAgo(t.updated_at)}
								</div>
							</a>
						))}
					</div>
				) : (
					<div class={css({ py: 16, textAlign: 'center', rounded: 'xl', border: '1px dashed token(colors.border)', bg: 'white' })}>
						<p class={css({ fontSize: 'sm', color: 'muted' })}>No threads match these filters.</p>
						<a href="/threads" class={css({ display: 'inline-block', mt: 4, fontSize: 'sm', color: 'accent', textDecoration: 'none' })}>
							Clear filters
						</a>
					</div>
				)}

				{/* Pagination */}
				<div class={css({ mt: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}>
					{cursor ? (
						<a href={basePath} class={css({ fontSize: 'sm', color: 'accent', textDecoration: 'none', _hover: { color: '#ea580c' } })}>
							← Newer
						</a>
					) : (
						<span />
					)}
					{nextCursor && (
						<a
							href={`${basePath}${basePath.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(nextCursor)}`}
							class={css({ fontSize: 'sm', color: 'accent', textDecoration: 'none', _hover: { color: '#ea580c' } })}
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
				<a href="/#boards" class={css({ fontSize: 'sm', color: 'muted', textDecoration: 'none', _hover: { color: 'ink' } })}>
					Boards
				</a>
				<a href="/threads" class={css({ fontSize: 'sm', fontWeight: 700, color: 'ink', textDecoration: 'none' })}>
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
