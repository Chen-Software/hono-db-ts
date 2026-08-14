import { css } from '../../../styled-system/css'
import { createRoute } from 'honox/factory'
import SearchBox from '../../islands/search'

/**
 * Boards list page — `/boards`.
 *
 * Pure SSR. Shows every board as a card (slug, description, moderator, thread
 * count, latest activity) linking to `/boards/:uuid`. Order is by thread count
 * (desc) — the busiest boards first — with keyset pagination on that cursor.
 */

type BoardRow = {
	id: string
	name: string
	slug: string
	description: string
	moderator_name: string | null
	created_at: string
	thread_count: number
	last_activity: string | null
}

const PAGE_SIZE = 12

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
	const cursor = c.req.query('cursor') ?? ''

	let boards: BoardRow[] = []
	let total = 0

	try {
		const sql = c.env.sql
		if (sql) {
			const where: string[] = []
			const params: unknown[] = []
			if (cursor) {
				// Keyset on (thread_count DESC, id ASC) — composite so equal counts
				// still order deterministically. Cursor encodes `<count>:<id>`.
				const [cnt, id] = cursor.split(':')
				const count = Number(cnt)
				if (id) {
					where.push(
						`(tc < ${Number.isNaN(count) ? 0 : count} OR (tc = ${Number.isNaN(count) ? 0 : count} AND b.id > ?))`,
					)
					params.push(id)
				}
			}
			const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

			const totalRes = (await sql.unsafe(
				`SELECT COUNT(*) AS n FROM "boards"`,
			)) as Array<{ n: number }>
			total = totalRes[0]?.n ?? 0

			boards = (await sql.unsafe(
				`SELECT b.id, b.name, b.slug, b.description, b."created_at",
				        u.name AS moderator_name,
				        (SELECT COUNT(*) FROM "threads" t WHERE t."boardId" = b.id) AS thread_count,
				        (SELECT MAX(t2."updated_at") FROM "threads" t2 WHERE t2."boardId" = b.id) AS last_activity
				 FROM "boards" b
				 LEFT JOIN "users" u ON u.id = b."moderatorId"
				 ${whereSql}
				 ORDER BY thread_count DESC, b.id ASC
				 LIMIT ${PAGE_SIZE}`,
				params,
			)) as BoardRow[]
		}
	} catch {
		boards = []
		total = 0
	}

	const nextCursor =
		boards.length === PAGE_SIZE
			? `${boards[boards.length - 1].thread_count}:${boards[boards.length - 1].id}`
			: null

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>Boards · BBS</title>
			<Nav />

			<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 10 })}>
				{/* Heading */}
				<div class={css({ mb: 8, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 })}>
					<div>
						<p class={css({ fontSize: 'xs', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'accent' })}>
							Browse communities
						</p>
						<h1 class={css({ mt: 1, fontSize: '2xl', fontWeight: 800 })}>Boards</h1>
						<p class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
							{total.toLocaleString()} board{total === 1 ? '' : 's'} · ordered by activity
						</p>
					</div>
					<a
						href="/#new-thread"
						class={css({ px: 4, py: 2, rounded: 'md', bg: 'accent', color: 'white', fontSize: 'sm', fontWeight: 600, textDecoration: 'none', _hover: { bg: '#ea580c' } })}
					>
						New thread
					</a>
				</div>

				{/* Board grid */}
				{boards.length > 0 ? (
					<div class={css({ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 })}>
						{boards.map((b) => (
							<a
								key={b.id}
								href={`/boards/${b.id}`}
								class={css({
									p: 5,
									rounded: 'xl',
									border: '1px solid token(colors.border)',
									bg: 'white',
									textDecoration: 'none',
									color: 'ink',
									transition: 'box-shadow 150ms, transform 150ms',
									_hover: {
										boxShadow: '0 8px 24px rgba(17,24,39,0.08)',
										transform: 'translateY(-2px)',
									},
								})}
							>
								<div class={css({ display: 'flex', alignItems: 'center', gap: 2 })}>
									<span class={css({ w: 2, h: 2, rounded: 'full', bg: 'accent', flexShrink: 0 })} />
									<h3 class={css({ fontWeight: 700, fontSize: 'md', truncate: true })}>{b.name}</h3>
								</div>
								<p class={css({ mt: 2, fontSize: 'sm', color: 'muted', lineClamp: 2, minHeight: '2.5rem' })}>
									{b.description}
								</p>
								<div class={css({ mt: 3, display: 'flex', alignItems: 'center', gap: 2, fontSize: 'xs', color: 'faint' })}>
									<span class={css({ px: 1.5, py: 0.5, rounded: 'full', bg: '#fff7ed', color: '#c2410c', fontWeight: 500 })}>
										/{b.slug}
									</span>
								</div>
								<div class={css({ mt: 3, pt: 3, borderTop: '1px solid token(colors.border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'xs', color: 'faint' })}>
									<span>
										<strong class={css({ color: 'ink', fontWeight: 700 })}>{b.thread_count}</strong> threads
									</span>
									<span class={css({ truncate: true, maxWidth: '9rem' })}>
										{b.last_activity ? `active ${timeAgo(b.last_activity)}` : 'no threads'}
									</span>
								</div>
							</a>
						))}
					</div>
				) : (
					<div class={css({ py: 16, textAlign: 'center', rounded: 'xl', border: '1px dashed token(colors.border)', bg: 'white' })}>
						<p class={css({ fontSize: 'sm', color: 'muted' })}>No boards yet.</p>
					</div>
				)}

				{/* Pagination */}
				<div class={css({ mt: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}>
					{cursor ? (
						<a href="/boards" class={css({ fontSize: 'sm', color: 'accent', textDecoration: 'none' })}>
							← Previous
						</a>
					) : (
						<span />
					)}
					{nextCursor && (
						<a
							href={`/boards?cursor=${encodeURIComponent(nextCursor)}`}
							class={css({ fontSize: 'sm', color: 'accent', textDecoration: 'none' })}
						>
							Next →
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
				<a href="/boards" class={css({ fontSize: 'sm', fontWeight: 700, color: 'ink', textDecoration: 'none' })}>
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
