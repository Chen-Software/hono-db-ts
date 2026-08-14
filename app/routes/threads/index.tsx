import { css } from '../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Badge, Button, Heading, Stack, Text } from '../../components/ui'
import { Header as LayoutHeader } from '../../components/ui/layout'
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

	const lastThread = threads[threads.length - 1]
	const nextCursor = threads.length === PAGE_SIZE && lastThread ? lastThread.updated_at : null
	const basePath = `/threads?board=${encodeURIComponent(boardFilter)}` +
		(lockedFilter ? `&locked=${lockedFilter}` : '')

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>Threads · BBS</title>
			<Nav />

			<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 10 })}>
				{/* Heading */}
				<Stack direction="horizontal" justify="between" align="flex-end" wrap gap="4" class={css({ mb: 6 })}>
					<div>
						<Text class={css({ fontSize: 'xs', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'accent' })}>
							All discussions
						</Text>
						<Heading class={css({ mt: 1, fontSize: '2xl', fontWeight: 800 })}>Threads</Heading>
						<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
							{total.toLocaleString()} thread{total === 1 ? '' : 's'}
							{boardFilter ? ' in this board' : ''}
						</Text>
					</div>
					<Button as="a" href="/#new-thread" colorPalette="orange" size="sm">
						New thread
					</Button>
				</Stack>

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

					<Button type="submit" size="sm" variant="outline">
						Filter
					</Button>
					{(boardFilter || lockedFilter) && (
						<Anchor href="/threads" variant="plain" class={css({ fontSize: 'sm', color: 'muted' })}>
							Clear
						</Anchor>
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
							<Anchor
								key={t.id}
								href={`/threads/${t.id}`}
								variant="plain"
								class={css({
									display: 'grid',
									gridTemplateColumns: '1fr 12rem 5rem 5rem',
									gap: 4,
									alignItems: 'center',
									px: 5,
									py: 4,
									color: 'ink',
									borderTop: i === 0 ? 'none' : '1px solid token(colors.border)',
									_hover: { bg: '#fafafa' },
								})}
							>
								<div class={css({ minWidth: 0 })}>
									<Stack direction="horizontal" align="center" gap="2">
										{t.pinned === 1 && (
											<Badge colorPalette="amber" variant="subtle">
												Pin
											</Badge>
										)}
										{t.locked === 1 && (
											<Badge colorPalette="red" variant="subtle">
												Locked
											</Badge>
										)}
										<Text class={css({ fontWeight: 600, fontSize: 'sm', lineClamp: 1 })}>{t.title}</Text>
									</Stack>
									<Text class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>
										{t.author_name ?? 'unknown'}
									</Text>
								</div>

								<Text class={css({ fontSize: 'sm', color: 'muted', truncate: true })}>
									{t.board_name ?? '—'}
								</Text>

								<Text class={css({ fontSize: 'sm', color: 'muted', textAlign: 'center' })}>
									{t.reply_count}
								</Text>

								<Text class={css({ fontSize: 'xs', color: 'faint', textAlign: 'right', whiteSpace: 'nowrap' })}>
									{timeAgo(t.updated_at)}
								</Text>
							</Anchor>
						))}
					</div>
				) : (
					<div class={css({ py: 16, textAlign: 'center', rounded: 'xl', border: '1px dashed token(colors.border)', bg: 'white' })}>
						<Text class={css({ fontSize: 'sm', color: 'muted' })}>No threads match these filters.</Text>
						<Anchor href="/threads" variant="plain" class={css({ display: 'inline-block', mt: 4, fontSize: 'sm', color: 'accent' })}>
							Clear filters
						</Anchor>
					</div>
				)}

				{/* Pagination */}
				<Stack direction="horizontal" justify="between" align="center" class={css({ mt: 6 })}>
					{cursor ? (
						<Anchor href={basePath} variant="plain" class={css({ fontSize: 'sm', color: 'accent' })}>
							← Newer
						</Anchor>
					) : (
						<span />
					)}
					{nextCursor && (
						<Anchor
							href={`${basePath}${basePath.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(nextCursor)}`}
							variant="plain"
							class={css({ fontSize: 'sm', color: 'accent' })}
						>
							Older →
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
		<LayoutHeader sticky>
			<Stack direction="horizontal" align="center" gap="6" class={css({ flex: 1 })}>
				<Anchor href="/" variant="plain" class={css({ display: 'flex', alignItems: 'center', gap: 2, fontWeight: 800, fontSize: 'lg', color: 'ink' })}>
					<span class={css({ display: 'inline-block', w: 3, h: 3, rounded: 'sm', bg: 'accent' })} />
					BBS Forum
				</Anchor>

				<nav class={css({ display: 'flex', gap: 4, ml: 4 })}>
					<Anchor href="/#boards" variant="plain" class={css({ fontSize: 'sm', color: 'muted' })}>
						Boards
					</Anchor>
					<Anchor href="/threads" variant="plain" class={css({ fontSize: 'sm', fontWeight: 700, color: 'ink' })}>
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
		</LayoutHeader>
	)
}
