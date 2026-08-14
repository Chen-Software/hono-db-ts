import { css } from '../../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Button, Card, Heading, Stack, Text } from '../../../components/ui'
import { Header as LayoutHeader } from '../../../components/ui/layout'
import SearchBox from '../../../islands/search'

/**
 * Thread edit page — `/threads/:uuid/edit`.
 *
 * Pure SSR. GET renders a full edit form (title, board, pinned, locked) for an
 * existing thread; POST applies the update and redirects back to the detail
 * page `/threads/:uuid`. Separating the editor from the detail page keeps each
 * route single-purpose (read+reply vs. edit).
 */

type ThreadRow = {
	id: string
	title: string
	pinned: number
	locked: number
	boardId: string
	authorId: string
}

type Board = { id: string; name: string }

export default createRoute(async (c) => {
	const uuid = c.req.param('uuid')

	let thread: ThreadRow | null = null
	let boards: Board[] = []
	let boardName = ''

	try {
		const sql = c.env.sql
		if (sql) {
			const rows = (await sql.unsafe(
				`SELECT id, title, pinned, locked, "boardId", "authorId" FROM "threads" WHERE "id" = ? LIMIT 1`,
				[uuid],
			)) as ThreadRow[]
			thread = rows[0] ?? null

			boards = (await sql.unsafe(
				`SELECT id, name FROM "boards" ORDER BY "created_at" DESC LIMIT 50`,
			)) as Board[]

			if (thread) {
				const b = (await sql.unsafe(
					`SELECT name FROM "boards" WHERE "id" = ? LIMIT 1`,
					[thread.boardId],
				)) as Array<{ name: string }>
				boardName = b[0]?.name ?? ''
			}
		}
	} catch {
		thread = null
		boards = []
	}

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
					<Button as="a" href="/" colorPalette="orange" size="sm" class={css({ mt: 6 })}>
						Back to forum
					</Button>
				</main>
			</div>,
		)
	}

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>Edit · {thread.title} · BBS</title>
			<Nav />

			<main class={css({ maxWidth: '3xl', mx: 'auto', px: 6, py: 10 })}>
				{/* Breadcrumb */}
				<Stack direction="horizontal" align="center" gap="2" class={css({ fontSize: 'sm', color: 'muted', mb: 6 })}>
					<Anchor href="/" variant="plain" class={css({ color: 'muted' })}>
						Home
					</Anchor>
					<span aria-hidden>›</span>
					<Anchor href={`/threads/${thread.id}`} variant="plain" class={css({ color: 'muted' })}>
						{boardName || 'Thread'}
					</Anchor>
					<span aria-hidden>›</span>
					<Text class={css({ color: 'ink', fontWeight: 500 })}>Edit</Text>
				</Stack>

				{/* Edit form */}
				<Card class={css({ p: 6, width: 'full' })}>
					<Heading class={css({ fontSize: 'xl', fontWeight: 800 })}>Edit thread</Heading>
					<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
						Changes are applied immediately and saved via the thread's
						<code class={css({ color: 'accent' })}> PUT /threads/:id </code>
						endpoint.
					</Text>

					<form
						method="post"
						action={`/threads/${thread.id}/edit`}
						class={css({ mt: 6, spaceY: 5 })}
					>
						<input type="hidden" name="action" value="save" />

						{/* Title */}
						<div>
							<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
								Title
							</label>
							<input
								name="title"
								required
								maxLength={300}
								defaultValue={thread.title}
								class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
							/>
						</div>

						{/* Board */}
						<div>
							<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
								Board
							</label>
							<select
								name="boardId"
								class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', bg: 'white', outline: 'none', _focus: { borderColor: 'accent' } })}
							>
								{boards.map((b) => (
									<option key={b.id} value={b.id} selected={b.id === thread.boardId}>
										{b.name}
									</option>
								))}
							</select>
						</div>

						{/* Toggles */}
						<div class={css({ display: 'flex', gap: 8 })}>
							<label class={css({ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'sm', cursor: 'pointer' })}>
								<input
									type="checkbox"
									name="pinned"
									value="1"
									checked={thread.pinned === 1}
									class={css({ accentColor: 'accent' })}
								/>
								Pin thread
							</label>
							<label class={css({ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'sm', cursor: 'pointer' })}>
								<input
									type="checkbox"
									name="locked"
									value="1"
									checked={thread.locked === 1}
									class={css({ accentColor: 'accent' })}
								/>
								Lock thread
							</label>
						</div>

						{/* Actions */}
						<Stack direction="horizontal" align="center" gap="3" class={css({ pt: 2 })}>
							<Button type="submit" colorPalette="orange" size="md">
								Save changes
							</Button>
							<Anchor
								href={`/threads/${thread.id}`}
								variant="plain"
								class={css({ px: 4, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', color: 'muted' })}
							>
								Cancel
							</Anchor>
						</Stack>
					</form>
				</Card>
			</main>
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
					<Anchor href="/boards" variant="plain" class={css({ fontSize: 'sm', color: 'muted' })}>
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
		</LayoutHeader>
	)
}

/**
 * POST /threads/:uuid/edit — apply the edited fields (partial update, only the
 * provided columns are written) and redirect back to the detail page.
 */
export const POST = createRoute(async (c) => {
	const uuid = c.req.param('uuid')
	const sql = c.env.sql
	if (!sql) return c.redirect(`/threads/${uuid}`)

	const body = await c.req.parseBody()
	if (body['action'] === 'save') {
		const title = typeof body['title'] === 'string' ? body['title'].trim() : ''
		const boardId = typeof body['boardId'] === 'string' ? body['boardId'] : ''
		const pinned = body['pinned'] === '1' ? 1 : 0
		const locked = body['locked'] === '1' ? 1 : 0

		if (title) {
			try {
				await sql.unsafe(
					`UPDATE "threads" SET "title" = ?, "boardId" = ?, "pinned" = ?, "locked" = ?, "updated_at" = ? WHERE "id" = ?`,
					[title, boardId, pinned, locked, new Date().toISOString(), uuid],
				)
			} catch {
				// Failed update — bounce back to the edit page.
				return c.redirect(`/threads/${uuid}/edit`)
			}
		}
	}

	return c.redirect(`/threads/${uuid}`)
})
