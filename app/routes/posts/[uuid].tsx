import { css } from '../../../design-system/css'
import { createRoute } from 'honox/factory'
import { hashContent } from '../../../src/capacities/hashable'
import { Anchor, Badge, Button, Card, Heading, Stack, Text } from '../../components/ui'
import { SiteHeader } from '../../components/site-header'
import { apiFetch } from '../../lib/api'

/**
 * Post detail page — `/posts/:uuid`.
 *
 * Pure SSR. Shows a post (title, author, published state, body) and its
 * content address: the stored `contentHash` is shown alongside a LIVE
 * recomputation (sha256 of `body`), so a tampered / stale hash is surfaced
 * right on the page — the content-addressing integrity guarantee made visible.
 */

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

	// SSR: the post is fetched over HTTP from the JSON API (service layer).
	// `hashContent` still runs in the route — it is a pure sha256 of the
	// already-fetched body, used only to render the live content-address
	// integrity check, not a SQL operation.
	const post: any = await apiFetch(c, `/page/posts/${uuid}`)

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

	// Content addressing: live integrity check — recompute sha256(body) and
	// compare with the stored hash.
	const computedHash = hashContent(post.body)
	const intact = computedHash === post.contentHash

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>{post.title} · BBS</title>
			<Nav />

			<main class={css({ maxWidth: '3xl', mx: 'auto', px: 6, py: 10 })}>
				{/* Breadcrumb */}
				<Stack direction="horizontal" align="center" gap="2" class={css({ fontSize: 'sm', color: 'muted', mb: 6 })}>
					<Anchor href="/posts" variant="plain" class={css({ color: 'muted' })}>
						Posts
					</Anchor>
					<span aria-hidden>›</span>
					<Text class={css({ color: 'faint', truncate: true, maxWidth: '20rem' })}>{post.title}</Text>
				</Stack>

				{/* Post */}
				<Card class={css({ p: 8, width: 'full' })}>
					{/* Meta row */}
					<Stack direction="horizontal" align="center" gap="2" wrap>
						{post.published === 0 ? (
							<Badge colorPalette="gray" variant="subtle">
								Draft
							</Badge>
						) : (
							<Badge colorPalette="green" variant="subtle">
								Published
							</Badge>
						)}
						<Text as="span" class={css({ fontSize: 'xs', color: 'faint' })}>
							{post.author_name ?? 'unknown'} {post.author_email ? `· ${post.author_email}` : ''}
						</Text>
						<Text as="span" class={css({ fontSize: 'xs', color: 'faint' })}>Updated {timeAgo(post.updated_at)}</Text>
						<Anchor
							href={`/posts/${post.id}/edit`}
							variant="plain"
							class={css({ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1, fontSize: 'xs', color: 'muted' })}
						>
							<span aria-hidden>✏️</span>
							Edit
						</Anchor>
					</Stack>

					<Heading class={css({ mt: 4, fontSize: '3xl', fontWeight: 800, letterSpacing: '-0.02em' })}>
						{post.title}
					</Heading>

					<div class={css({ mt: 6, borderTop: '1px solid token(colors.border)', pt: 6 })}>
						<Text class={css({ fontSize: 'md', lineHeight: 1.8, whiteSpace: 'pre-wrap' })}>{post.body}</Text>
					</div>

					{/* Content address (integrity) */}
					<div
						class={css({
							mt: 8,
							rounded: 'lg',
							border: `1px solid ${intact ? 'token(colors.border)' : '#fecaca'}`,
							bg: intact ? '#fafafa' : '#fef2f2',
							px: 4,
							py: 3,
							fontSize: 'xs',
							color: 'muted',
						})}
					>
						<Stack direction="horizontal" align="center" gap="2" class={css({ fontWeight: 600, color: 'ink' })}>
							<span aria-hidden>{intact ? '🔗' : '⚠️'}</span>
							<Text as="span">Content address</Text>
							{intact ? (
								<Badge colorPalette="green" variant="subtle">
									verified
								</Badge>
							) : (
								<Badge colorPalette="red" variant="subtle">
									hash mismatch
								</Badge>
							)}
						</Stack>
						<Text class={css({ mt: 2, fontFamily: 'monospace', color: 'faint', wordBreak: 'break-all' })}>
							stored sha256: {post.contentHash}
						</Text>
						<Text class={css({ mt: 1, fontFamily: 'monospace', color: 'faint', wordBreak: 'break-all' })}>
							computed sha256: {computedHash}
						</Text>
						</div>
						</Card>
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
	return <SiteHeader />
}
