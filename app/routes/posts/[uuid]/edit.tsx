import { css } from '../../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Button, Card, Heading, Stack, Text } from '../../../components/ui'
import { SiteHeader } from '../../../components/site-header'
import { apiFetch, apiPostForm } from '../../../lib/api'

/**
 * Post edit page — `/posts/:uuid/edit`.
 *
 * Pure SSR. GET renders an edit form for a post (title, body, published);
 * POST applies the update — recomputing the SHA-256 `contentHash` from the new
 * `body` (the `Hashable<"body">` content-addressing invariant) and bumping
 * `updated_at` — then redirects back to the post. `authorId` / `author` are
 * immutable after creation.
 */

export default createRoute(async (c) => {
	const uuid = c.req.param('uuid')

	// SSR: the post edit form is fetched over HTTP from the JSON API (service
	// layer). The UI never opens a SQL connection.
	const post: any = await apiFetch(c, `/page/posts/${uuid}/edit`)

	if (!post) {
		c.status(404)
		return c.render(
			<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, sans-serif' })}>
				<title>Post not found · BBS</title>
				<Nav />
				<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 16, textAlign: 'center' })}>
					<Heading class={css({ fontSize: '2xl', fontWeight: 800 })}>Post not found</Heading>
					<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
						No post with id <code>{uuid}</code>.
					</Text>
					<Button as="a" href="/posts" size="sm" class={css({ mt: 6 })}>
						Back to posts
					</Button>
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
				<Stack direction="horizontal" align="center" gap="2" class={css({ fontSize: 'sm', color: 'muted', mb: 6 })}>
					<Anchor href="/posts" variant="plain" class={css({ color: 'muted' })}>
						Posts
					</Anchor>
					<span aria-hidden>›</span>
					<Anchor href={`/posts/${post.id}`} variant="plain" class={css({ color: 'muted' })}>
						{post.title}
					</Anchor>
					<span aria-hidden>›</span>
					<Text class={css({ color: 'ink', fontWeight: 500 })}>Edit</Text>
				</Stack>

				{/* Edit form */}
				<Card class={css({ p: 6, width: 'full' })}>
					<Heading class={css({ fontSize: 'xl', fontWeight: 800 })}>Edit post</Heading>
					<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
						Editing the body recomputes the content address (SHA-256). The author
						is fixed at creation.
					</Text>

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
						<Stack direction="horizontal" align="center" gap="3" class={css({ pt: 2 })}>
							<Button type="submit" size="md">
								Save changes
							</Button>
							<Anchor
								href={`/posts/${post.id}`}
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
	return <SiteHeader />
}

/**
 * POST /posts/:uuid/edit — apply the edited fields. Delegated to the service
 * layer via the JSON API, which recomputes the SHA-256 `contentHash` from the
 * (possibly changed) body and returns a redirect we stream back to the browser.
 */
export const POST = createRoute(async (c) => {
	const uuid = c.req.param('uuid')
	return apiPostForm(c, `/page/posts/${uuid}/edit`)
})
