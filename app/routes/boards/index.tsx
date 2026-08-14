import { css } from '../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Badge, Button, Card, Heading, Layout, Stack, Text } from '../../components/ui'
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
				<Stack direction="horizontal" justify="between" align="flex-end" wrap gap="4" class={css({ mb: 8 })}>
					<div>
						<Text class={css({ fontSize: 'xs', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'accent' })}>
							Browse communities
						</Text>
						<Heading class={css({ mt: 1, fontSize: '2xl', fontWeight: 800 })}>Boards</Heading>
						<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
							{total.toLocaleString()} board{total === 1 ? '' : 's'} · ordered by activity
						</Text>
					</div>
					<Button as="a" href="/#new-thread" colorPalette="orange" size="sm">
						New thread
					</Button>
				</Stack>

				{/* Board grid */}
				{boards.length > 0 ? (
					<div class={css({ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 })}>
						{boards.map((b) => (
							<Anchor key={b.id} href={`/boards/${b.id}`} variant="plain">
								<Card
									clickable
									class={css({
										p: 5,
										width: 'full',
										boxShadow: 'md',
										transition: 'box-shadow 150ms, transform 150ms',
										_hover: {
											boxShadow: '0 8px 24px rgba(17,24,39,0.08)',
											transform: 'translateY(-2px)',
										},
									})}
								>
									<Stack direction="horizontal" align="center" gap="2">
										<span class={css({ w: 2, h: 2, rounded: 'full', bg: 'accent', flexShrink: 0 })} />
										<Heading as="h3" class={css({ fontWeight: 700, fontSize: 'md', truncate: true, color: 'ink' })}>
											{b.name}
										</Heading>
									</Stack>
									<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted', lineClamp: 2, minHeight: '2.5rem' })}>
										{b.description}
									</Text>
									<Stack direction="horizontal" gap="2" class={css({ mt: 3, fontSize: 'xs', color: 'faint' })}>
										<Badge colorPalette="orange" size="sm" variant="subtle">
											/{b.slug}
										</Badge>
									</Stack>
									<Stack
										direction="horizontal"
										justify="between"
										align="center"
										class={css({ mt: 3, pt: 3, borderTop: '1px solid token(colors.border)', fontSize: 'xs', color: 'faint' })}
									>
										<Text as="span">
											<strong class={css({ color: 'ink', fontWeight: 700 })}>{b.thread_count}</strong> threads
										</Text>
										<Text as="span" class={css({ truncate: true, maxWidth: '9rem' })}>
											{b.last_activity ? `active ${timeAgo(b.last_activity)}` : 'no threads'}
										</Text>
									</Stack>
								</Card>
							</Anchor>
						))}
					</div>
				) : (
					<div class={css({ py: 16, textAlign: 'center', rounded: 'xl', border: '1px dashed token(colors.border)', bg: 'white' })}>
						<Text class={css({ fontSize: 'sm', color: 'muted' })}>No boards yet.</Text>
					</div>
				)}

				{/* Pagination */}
				<Stack direction="horizontal" justify="between" align="center" class={css({ mt: 8 })}>
					{cursor ? (
						<Anchor href="/boards" variant="plain" class={css({ fontSize: 'sm', color: 'accent' })}>
							← Previous
						</Anchor>
					) : (
						<span />
					)}
					{nextCursor && (
						<Anchor
							href={`/boards?cursor=${encodeURIComponent(nextCursor)}`}
							variant="plain"
							class={css({ fontSize: 'sm', color: 'accent' })}
						>
							Next →
						</Anchor>
					)}
				</Stack>
			</main>

			<footer class={css({ mt: 4, borderTop: '1px solid token(colors.border)', bg: 'white', px: 6, py: 8 })}>
				<Stack direction="horizontal" class={css({ maxWidth: '6xl', mx: 'auto', fontSize: 'sm', color: 'muted' })}>
					<Text>
						<span class={css({ fontWeight: 700, color: 'ink' })}>BBS Forum</span> — model-driven community demo.
					</Text>
				</Stack>
			</footer>
		</div>,
	)
})

/** Shared top navigation — mirrors the home page's header. */
function Nav() {
	return (
		<Layout.Header sticky>
			<Stack direction="horizontal" align="center" gap="6" class={css({ flex: 1 })}>
				<Anchor href="/" variant="plain" class={css({ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 800, fontSize: 'lg', color: 'ink' })}>
					<span class={css({ display: 'inline-block', w: 3, h: 3, rounded: 'sm', bg: 'accent' })} />
					BBS Forum
				</Anchor>

				<nav class={css({ display: 'flex', gap: 4, ml: 4 })}>
					<Anchor href="/boards" variant="plain" class={css({ fontSize: 'sm', fontWeight: 700, color: 'ink' })}>
						Boards
					</Anchor>
					<Anchor href="/threads" variant="plain" class={css({ fontSize: 'sm', color: 'muted' })}>
						Threads
					</Anchor>
				</nav>

				<Stack direction="horizontal" align="center" gap="3" class={css({ ml: 'auto' })}>
					<SearchBox />
					<Button as="a" href="/#new-thread" colorPalette="orange" size="sm">
						New thread
					</Button>
				</Stack>
			</Stack>
		</Layout.Header>
	)
}
