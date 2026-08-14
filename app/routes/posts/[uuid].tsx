import { css } from '../../../design-system/css'
import { createRoute } from 'honox/factory'
import { hashContent } from '../../../src/capacities/hashable'
import { Anchor, Badge, Button, Card, Heading, Stack, Text } from '../../components/ui'
import { Header as LayoutHeader } from '../../components/ui/layout'
import SearchBox from '../../islands/search'
import ThemeSwitcher from '../../islands/theme-switcher'

/**
 * Post detail page — `/posts/:uuid`.
 *
 * Pure SSR. Shows a post (title, author, published state, body) and its
 * content address: the stored `contentHash` is shown alongside a LIVE
 * recomputation (sha256 of `body`), so a tampered / stale hash is surfaced
 * right on the page — the content-addressing integrity guarantee made visible.
 */

type PostRow = {
	id: string
	title: string
	body: string
	published: number
	contentHash: string
	created_at: string
	updated_at: string
	author_name: string | null
	author_email: string | null
}

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

	let post: PostRow | null = null

	try {
		const sql = c.env.sql
		if (sql) {
			const rows = (await sql.unsafe(
				`SELECT p.id, p.title, p.body, p.published, p."contentHash", p."created_at", p."updated_at",
				        u.name AS author_name, u.email AS author_email
				 FROM "posts" p
				 LEFT JOIN "users" u ON u.id = p."authorId"
				 WHERE p.id = ?
				 LIMIT 1`,
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
					<Heading class={css({ fontSize: '2xl', fontWeight: 800 })}>Post not found</Heading>
					<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
						No post with id <code>{uuid}</code>.
					</Text>
					<Button as="a" href="/posts" colorPalette="orange" size="sm" class={css({ mt: 6 })}>
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
					<Anchor href="/posts" variant="plain" class={css({ fontSize: 'sm', color: 'muted' })}>
						Posts
					</Anchor>
				</nav>

				<Stack direction="horizontal" align="center" gap="3" class={css({ ml: 'auto' })}>
					<SearchBox />
					<ThemeSwitcher />
					<Button as="a" href="/#new-thread" colorPalette="orange" size="sm">
						New thread
					</Button>
				</Stack>
			</Stack>
		</LayoutHeader>
	)
}
