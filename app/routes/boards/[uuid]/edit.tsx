import { css } from '../../../../design-system/css'
import { createRoute } from 'honox/factory'
import SearchBox from '../../../islands/search'

/**
 * Board edit page — `/boards/:uuid/edit`.
 *
 * Pure SSR. GET renders a full edit form for a board's editable fields
 * (name, slug, description, moderator); POST applies the update and redirects
 * back to the board detail page. Keeping the editor separate from the detail
 * route keeps each page single-purpose.
 */

type BoardRow = {
	id: string
	name: string
	slug: string
	description: string
	moderatorId: string
}

type User = { id: string; name: string; email: string }

export default createRoute(async (c) => {
	const uuid = c.req.param('uuid')

	let board: BoardRow | null = null
	let users: User[] = []

	try {
		const sql = c.env.sql
		if (sql) {
			const rows = (await sql.unsafe(
				`SELECT id, name, slug, description, "moderatorId" FROM "boards" WHERE "id" = ? LIMIT 1`,
				[uuid],
			)) as BoardRow[]
			board = rows[0] ?? null

			users = (await sql.unsafe(
				`SELECT id, name, email FROM "users" ORDER BY "created_at" DESC LIMIT 50`,
			)) as User[]
		}
	} catch {
		board = null
		users = []
	}

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

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>Edit · {board.name} · BBS</title>
			<Nav />

			<main class={css({ maxWidth: '3xl', mx: 'auto', px: 6, py: 10 })}>
				{/* Breadcrumb */}
				<nav class={css({ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'sm', color: 'muted', mb: 6 })}>
					<a href="/" class={css({ color: 'muted', textDecoration: 'none', _hover: { color: 'accent' } })}>
						Home
					</a>
					<span aria-hidden>›</span>
					<a href={`/boards/${board.id}`} class={css({ color: 'muted', textDecoration: 'none', _hover: { color: 'accent' } })}>
						{board.name}
					</a>
					<span aria-hidden>›</span>
					<span class={css({ color: 'ink', fontWeight: 500 })}>Edit</span>
				</nav>

				{/* Edit form */}
				<section class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', p: 6 })}>
					<h1 class={css({ fontSize: 'xl', fontWeight: 800 })}>Edit board</h1>
					<p class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
						Changes are applied immediately and saved via the board's
						<code class={css({ color: 'accent' })}> PUT /boards/:id </code>
						endpoint.
					</p>

					<form
						method="post"
						action={`/boards/${board.id}/edit`}
						class={css({ mt: 6, spaceY: 5 })}
					>
						<input type="hidden" name="action" value="save" />

						{/* Name */}
						<div>
							<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
								Name
							</label>
							<input
								name="name"
								required
								maxLength={80}
								defaultValue={board.name}
								class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
							/>
						</div>

						{/* Slug */}
						<div>
							<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
								Slug
							</label>
							<div class={css({ display: 'flex', alignItems: 'center', gap: 2, rounded: 'md', border: '1px solid token(colors.border)', px: 3, _focusWithin: { borderColor: 'accent' } })}>
								<span class={css({ fontSize: 'sm', color: 'faint' })}>/</span>
								<input
									name="slug"
									required
									maxLength={80}
									defaultValue={board.slug}
									class={css({ w: 'full', py: 2, border: 'none', fontSize: 'sm', outline: 'none', bg: 'transparent' })}
								/>
							</div>
							<p class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>URL-safe identifier (must be unique).</p>
						</div>

						{/* Description */}
						<div>
							<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
								Description
							</label>
							<textarea
								name="description"
								rows={4}
								maxLength={500}
								defaultValue={board.description}
								class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', outline: 'none', resize: 'vertical', _focus: { borderColor: 'accent' } })}
							/>
						</div>

						{/* Moderator */}
						<div>
							<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
								Moderator
							</label>
							<select
								name="moderatorId"
								class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', bg: 'white', outline: 'none', _focus: { borderColor: 'accent' } })}
							>
								{users.map((u) => (
									<option key={u.id} value={u.id} selected={u.id === board.moderatorId}>
										{u.name} ({u.email})
									</option>
								))}
							</select>
						</div>

						{/* Actions */}
						<div class={css({ pt: 2, display: 'flex', alignItems: 'center', gap: 3 })}>
							<button
								type="submit"
								class={css({ px: 5, py: 2, rounded: 'md', bg: 'accent', color: 'white', fontSize: 'sm', fontWeight: 600, border: 'none', cursor: 'pointer', _hover: { bg: '#ea580c' } })}
							>
								Save changes
							</button>
							<a
								href={`/boards/${board.id}`}
								class={css({ px: 4, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', color: 'muted', textDecoration: 'none', _hover: { bg: '#fafafa' } })}
							>
								Cancel
							</a>
						</div>
					</form>
				</section>
			</main>
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
 * POST /boards/:uuid/edit — apply the edited fields and redirect to the board.
 */
export const POST = createRoute(async (c) => {
	const uuid = c.req.param('uuid')
	const sql = c.env.sql
	if (!sql) return c.redirect(`/boards/${uuid}`)

	const body = await c.req.parseBody()
	if (body.action === 'save') {
		const name = typeof body.name === 'string' ? body.name.trim() : ''
		const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
		const description = typeof body.description === 'string' ? body.description.trim() : ''
		const moderatorId = typeof body.moderatorId === 'string' ? body.moderatorId : ''

		if (name && slug && moderatorId) {
			try {
				await sql.unsafe(
					`UPDATE "boards" SET "name" = ?, "slug" = ?, "description" = ?, "moderatorId" = ? WHERE "id" = ?`,
					[name, slug, description, moderatorId, uuid],
				)
			} catch {
				// Failed update (e.g. duplicate slug) — bounce back to the edit page.
				return c.redirect(`/boards/${uuid}/edit`)
			}
		}
	}

	return c.redirect(`/boards/${uuid}`)
})
