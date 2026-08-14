import { css } from '../../../../styled-system/css'
import { createRoute } from 'honox/factory'
import { hashContent } from '../../../../src/capacities/hashable'
import SearchBox from '../../../islands/search'

/**
 * Post edit page — `/posts/:uuid/edit`.
 *
 * Pure SSR. GET renders an edit form for a post (title, body, published);
 * POST applies the update — recomputing the SHA-256 `contentHash` from the new
 * `body` (the `Hashable<"body">` content-addressing invariant) and bumping
 * `updated_at` — then redirects back to the post. `authorId` / `author` are
 * immutable after creation.
 */

type PostRow = {
	id: string
	title: string
	body: string
	published: number
	contentHash: string
}

export default createRoute(async (c) => {
	const uuid = c.req.param('uuid')

	let post: PostRow | null = null

	try {
		const sql = c.env.sql
		if (sql) {
			const rows = (await sql.unsafe(
				`SELECT id, title, body, published, "contentHash" FROM "posts" WHERE "id" = ? LIMIT 1`,
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

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>Edit · {post.title} · BBS</title>
			<Nav />

			<main class={css({ maxWidth: '3xl', mx: 'auto', px: 6, py: 10 })}>
				{/* Breadcrumb */}
				<nav class={css({ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'sm', color: 'muted', mb: 6 })}>
					<a href="/posts" class={css({ color: 'muted', textDecoration: 'none', _hover: { color: 'accent' } })}>
						Posts
					</a>
					<span aria-hidden>›</span>
					<a href={`/posts/${post.id}`} class={css({ color: 'muted', textDecoration: 'none', _hover: { color: 'accent' } })}>
						{post.title}
					</a>
					<span aria-hidden>›</span>
					<span class={css({ color: 'ink', fontWeight: 500 })}>Edit</span>
				</nav>

				{/* Edit form */}
				<section class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', p: 6 })}>
					<h1 class={css({ fontSize: 'xl', fontWeight: 800 })}>Edit post</h1>
					<p class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
						Editing the body recomputes the content address (SHA-256). The author
						is fixed at creation.
					</p>

					<form method="post" action={`/posts/${post.id}/edit`} class={css({ mt: 6, spaceY: 5 })}>
						<input type="hidden" name="action" value="save" />

						{/* Title */}
						<div>
							<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
								Title
							</label>
							<input
								name="title"
								required
								maxLength={200}
								defaultValue={post.title}
								class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
							/>
						</div>

						{/* Body */}
						<div>
							<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
								Body
							</label>
							<textarea
								name="body"
								required
								rows={12}
								maxLength={10000}
								defaultValue={post.body}
								class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', outline: 'none', resize: 'vertical', fontFamily: 'monospace', _focus: { borderColor: 'accent' } })}
							/>
							<p class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>
								Current hash: <code class={css({ wordBreak: 'break-all' })}>{post.contentHash.slice(0, 16)}…</code>
							</p>
						</div>

						{/* Published */}
						<label class={css({ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'sm', cursor: 'pointer' })}>
							<input
								type="checkbox"
								name="published"
								value="1"
								checked={post.published === 1}
								class={css({ accentColor: 'accent' })}
							/>
							Published (visible on the site)
						</label>

						{/* Actions */}
						<div class={css({ pt: 2, display: 'flex', alignItems: 'center', gap: 3 })}>
							<button
								type="submit"
								class={css({ px: 5, py: 2, rounded: 'md', bg: 'accent', color: 'white', fontSize: 'sm', fontWeight: 600, border: 'none', cursor: 'pointer', _hover: { bg: '#ea580c' } })}
							>
								Save changes
							</button>
							<a
								href={`/posts/${post.id}`}
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

/**
 * POST /posts/:uuid/edit — apply the edited fields. Recomputes the SHA-256
 * `contentHash` from the (possibly changed) body so the content address stays
 * canonical, bumps `updated_at`, and redirects back to the post.
 */
export const POST = createRoute(async (c) => {
	const uuid = c.req.param('uuid')
	const sql = c.env.sql
	if (!sql) return c.redirect(`/posts/${uuid}`)

	const body = await c.req.parseBody()
	if (body.action === 'save') {
		const title = typeof body.title === 'string' ? body.title.trim() : ''
		const postBody = typeof body.body === 'string' ? body.body : ''
		const published = body.published === '1' ? 1 : 0

		if (title && postBody) {
			try {
				const contentHash = hashContent(postBody)
				await sql.unsafe(
					`UPDATE "posts" SET "title" = ?, "body" = ?, "published" = ?, "contentHash" = ?, "updated_at" = ? WHERE "id" = ?`,
					[title, postBody, published, contentHash, new Date().toISOString(), uuid],
				)
			} catch {
				return c.redirect(`/posts/${uuid}/edit`)
			}
		}
	}

	return c.redirect(`/posts/${uuid}`)
})
