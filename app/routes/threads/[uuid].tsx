import { css } from '../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Badge, Button, Card, Heading, Stack, Text } from '../../components/ui'
import { SiteHeader } from '../../components/site-header'
import { ThreadDrawer } from '../../components/thread-drawer'

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
	boardId: string
	created_at: string
	updated_at: string
	author_name: string | null
	board_name: string | null
	board_slug: string | null
}

type Board = { id: string; name: string }

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
	let boards: Board[] = []

	try {
		const sql = c.env.sql
		if (sql) {
			const rows = (await sql.unsafe(
				`SELECT t.id, t.title, t.pinned, t.locked, t."boardId", t."created_at", t."updated_at",
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

			boards = (await sql.unsafe(
				`SELECT id, name FROM "boards" ORDER BY "created_at" DESC LIMIT 50`,
			)) as Board[]

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
		boards = []
		}

	// 404 when the thread doesn't exist (or the db is unavailable).
	if (!thread) {
		c.status(404)
		return c.render(
			<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, sans-serif' })}>
				<title>Thread not found · BBS</title>
				<Nav />
				<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 16, textAlign: 'center' })}>
					<Heading class={css({ fontSize: '2xl', fontWeight: 800 })}>Thread not found</Heading>
					<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
						No thread with id <code>{uuid}</code>.
					</Text>
					<Button as="a" href="/" size="sm" class={css({ mt: 6 })}>
						Back to forum
					</Button>
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
				<Stack direction="horizontal" align="center" gap="2" class={css({ fontSize: 'sm', color: 'muted', mb: 6 })}>
					<Anchor href="/" variant="plain" class={css({ color: 'muted' })}>
						Home
					</Anchor>
					<span aria-hidden>›</span>
					{thread.board_name ? (
						<Text class={css({ color: 'ink', fontWeight: 500 })}>{thread.board_name}</Text>
					) : (
						<Text>Unknown board</Text>
					)}
					<span aria-hidden>›</span>
					<Text class={css({ color: 'faint', truncate: true, maxWidth: '20rem' })}>{thread.title}</Text>
				</Stack>

				<div class={css({ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 })}>
					{/* ---- main column ---- */}
					<div>
						{/* Thread header */}
						<Card class={css({ p: 6, width: 'full' })}>
							<Stack direction="horizontal" align="center" gap="2" wrap>
								{thread.pinned === 1 && (
									<Badge colorPalette="amber" variant="subtle">
										Pin
									</Badge>
								)}
								{thread.locked === 1 && (
									<Badge colorPalette="red" variant="subtle">
										Locked
									</Badge>
								)}
								{thread.board_slug && (
									<Badge variant="subtle">
										/{thread.board_slug}
									</Badge>
								)}
							</Stack>

							<Heading class={css({ mt: 3, fontSize: '2xl', fontWeight: 800, letterSpacing: '-0.01em' })}>
								{thread.title}
							</Heading>

							<Stack direction="horizontal" align="center" gap="4" class={css({ mt: 3, fontSize: 'xs', color: 'faint' })}>
								<Text as="span" class={css({ display: 'flex', alignItems: 'center', gap: 1 })}>
									<span aria-hidden>👤</span>
									{thread.author_name ?? 'unknown'}
								</Text>
								<Text as="span">
									Started {timeAgo(thread.created_at)}
								</Text>
								<Text as="span">
									Updated {timeAgo(thread.updated_at)}
								</Text>
								<Text as="span">{replies.length} replies</Text>
								{boards.length > 0 ? (
									<ThreadDrawer
										boards={boards}
										thread={{
											id: thread.id,
											title: thread.title,
											boardId: thread.boardId,
											pinned: thread.pinned === 1,
											locked: thread.locked === 1,
										}}
										trigger={
											<Anchor
												href={`/threads/${thread.id}/edit`}
												variant="plain"
												class={css({ display: 'flex', alignItems: 'center', gap: 1, color: 'muted' })}
											>
												<span aria-hidden>✏️</span>
												Edit
											</Anchor>
										}
									/>
								) : (
									<Anchor
										href={`/threads/${thread.id}/edit`}
										variant="plain"
										class={css({ display: 'flex', alignItems: 'center', gap: 1, color: 'muted' })}
									>
										<span aria-hidden>✏️</span>
										Edit
									</Anchor>
								)}
								</Stack>
						</Card>

						{/* Replies */}
						<section class={css({ mt: 8 })}>
							<Heading class={css({ mb: 4, fontSize: 'lg', fontWeight: 700 })}>Replies ({replies.length})</Heading>

							{topLevel.length > 0 ? (
								<div class={css({ spaceY: 3 })}>
									{topLevel.map((r) => (
										<ReplyCard key={r.id} reply={r} nested={replies.filter((x) => x.parentId === r.id)} />
									))}
								</div>
							) : (
								<Text class={css({ py: 8, textAlign: 'center', fontSize: 'sm', color: 'faint' })}>
									No replies yet — be the first.
								</Text>
							)}
						</section>

						{/* Reply form */}
						<section class={css({ mt: 8 })}>
							<Heading class={css({ mb: 4, fontSize: 'lg', fontWeight: 700 })}>Post a reply</Heading>
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
								<Button type="submit" size="sm">
									Post reply
								</Button>
							</form>
						</section>
					</div>

					{/* ---- sidebar ---- */}
					<aside class={css({ spaceY: 8 })}>
						<section>
							<Heading class={css({ mb: 4, fontSize: 'lg', fontWeight: 700 })}>Hot threads</Heading>
							{hot.length > 0 ? (
								<div class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', p: 2 })}>
									{hot.map((t, i) => (
										<Anchor
											key={t.id}
											href={`/threads/${t.id}`}
											variant="plain"
											class={css({ display: 'flex', gap: 3, alignItems: 'flex-start', px: 3, py: 3, rounded: 'lg', _hover: { bg: '#fafafa' } })}
										>
											<span
												class={css({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', w: 5, h: 5, rounded: 'md', fontSize: 'xs', fontWeight: 700, bg: i < 3 ? 'accent' : '#f3f4f6', color: i < 3 ? 'white' : 'muted', flexShrink: 0 })}
											>
												{i + 1}
											</span>
											<div class={css({ minWidth: 0 })}>
												<Text class={css({ fontSize: 'sm', fontWeight: 600, lineClamp: 2, color: 'ink' })}>{t.title}</Text>
												<Text class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>{t.reply_count} replies</Text>
											</div>
										</Anchor>
									))}
								</div>
							) : (
								<Text class={css({ fontSize: 'sm', color: 'faint' })}>No hot threads yet.</Text>
							)}
						</section>
					</aside>
				</div>
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

/** A reply card — renders the body, author meta and any nested replies. */
function ReplyCard({ reply, nested }: { reply: ReplyRow; nested: ReplyRow[] }) {
	return (
		<Card class={css({ width: 'full' })}>
			<div class={css({ px: 5, py: 4 })}>
				<Stack direction="horizontal" align="center" gap="3" class={css({ fontSize: 'xs', color: 'faint' })}>
					<Text as="span" class={css({ display: 'flex', alignItems: 'center', gap: 1 })}>
						<span aria-hidden>👤</span>
						{reply.author_name ?? 'unknown'}
					</Text>
					<Text as="span">{timeAgo(reply.created_at)}</Text>
				</Stack>
				<Text class={css({ mt: 2, fontSize: 'sm', lineHeight: 1.7, whiteSpace: 'pre-wrap' })}>{reply.body}</Text>
			</div>

			{nested.length > 0 && (
				<div class={css({ ml: 6, borderTop: '1px solid token(colors.border)', borderLeft: '3px solid #fdba74', spaceY: 2, p: 3 })}>
					{nested.map((r) => (
						<div key={r.id} class={css({ px: 3, py: 3, rounded: 'lg', bg: '#fffaf5' })}>
							<Stack direction="horizontal" align="center" gap="3" class={css({ fontSize: 'xs', color: 'faint' })}>
								<Text as="span">↳ {r.author_name ?? 'unknown'}</Text>
								<Text as="span">{timeAgo(r.created_at)}</Text>
							</Stack>
							<Text class={css({ mt: 1.5, fontSize: 'sm', lineHeight: 1.6, whiteSpace: 'pre-wrap' })}>{r.body}</Text>
						</div>
					))}
				</div>
			)}
		</Card>
	)
}

/** Shared top navigation — mirrors the home page's header. */
function Nav() {
	return <SiteHeader />
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
	const action = typeof body['action'] === 'string' ? body['action'] : ''

	if (action === 'reply') {
		const threadId = typeof body['threadId'] === 'string' ? body['threadId'] : uuid
		const authorId = typeof body['authorId'] === 'string' ? body['authorId'] : ''
		const parentId = typeof body['parentId'] === 'string' && body['parentId'] ? body['parentId'] : null
		const replyBody = typeof body['body'] === 'string' ? body['body'].trim() : ''

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
