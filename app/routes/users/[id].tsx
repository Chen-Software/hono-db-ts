import { css } from '../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Badge, Button, Card, Heading, Stack, Text } from '../../components/ui'
import { Header as LayoutHeader } from '../../components/ui/layout'
import SearchBox from '../../islands/search'
import ThemeSwitcher from '../../islands/theme-switcher'
import { getSession } from '../../../src/auth/context'

/**
 * User profile page — `/users/:id`.
 *
 * Authenticated-only (SSR). Shows the signed-in member's public profile (name,
 * email, role, age, joined) plus their recent activity split into three
 * sections: the threads they started, the posts they authored, and the replies
 * they left. Every activity row links back to the relevant resource.
 *
 * The route checks the Better Auth session cookie first (`getSession`); if no
 * valid session is found it redirects to `/sign-in` so unauthenticated
 * visitors can log in before viewing the profile.
 */

type UserRow = {
	id: string
	name: string
	email: string
	role: string
	age: number
	created_at: string
}

type UserThread = {
	id: string
	title: string
	created_at: string
	updated_at: string
	board_name: string | null
	reply_count: number
}

type UserPost = {
	id: string
	title: string
	updated_at: string
}

type UserReply = {
	id: string
	threadId: string
	thread_title: string | null
	body: string
	created_at: string
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
	const id = c.req.param('id')

	// Authenticated-only: if the session cookie is missing/invalid, send the
	// visitor to sign-in (remember where they were so we can return them).
	const session = await getSession(c)
	if (!session?.user) {
		return c.redirect(`/sign-in?next=/users/${id}`)
	}

	let user: UserRow | null = null
	let threads: UserThread[] = []
	let posts: UserPost[] = []
	let replies: UserReply[] = []

	try {
		const sql = c.env.sql
		if (sql) {
			const rows = (await sql.unsafe(
				`SELECT id, name, email, role, age, "created_at" FROM "users" WHERE "id" = ? LIMIT 1`,
				[id],
			)) as UserRow[]
			user = rows[0] ?? null

			if (user) {
				threads = (await sql.unsafe(
					`SELECT t.id, t.title, t."created_at", t."updated_at",
					        b.name AS board_name,
					        (SELECT COUNT(*) FROM "replies" r WHERE r."threadId" = t.id) AS reply_count
					 FROM "threads" t
					 LEFT JOIN "boards" b ON b.id = t."boardId"
					 WHERE t."authorId" = ?
					 ORDER BY t."updated_at" DESC
					 LIMIT 10`,
					[id],
				)) as UserThread[]

				posts = (await sql.unsafe(
					`SELECT id, title, "updated_at" FROM "posts"
					 WHERE "authorId" = ? AND published = 1
					 ORDER BY "updated_at" DESC
					 LIMIT 10`,
					[id],
				)) as UserPost[]

				replies = (await sql.unsafe(
					`SELECT r.id, r."threadId", r.body, r."created_at", t.title AS thread_title
					 FROM "replies" r
					 LEFT JOIN "threads" t ON t.id = r."threadId"
					 WHERE r."authorId" = ?
					 ORDER BY r."created_at" DESC
					 LIMIT 10`,
					[id],
				)) as UserReply[]
			}
		}
	} catch {
		user = null
		threads = []
		posts = []
		replies = []
	}

	if (!user) {
		c.status(404)
		return c.render(
			<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, sans-serif' })}>
				<title>User not found · BBS</title>
				<Nav />
				<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 16, textAlign: 'center' })}>
					<Heading class={css({ fontSize: '2xl', fontWeight: 800 })}>User not found</Heading>
					<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
						No user with id <code>{id}</code>.
					</Text>
					<Button as="a" href="/" colorPalette="orange" size="sm" class={css({ mt: 6 })}>
						Back to forum
					</Button>
				</main>
			</div>,
		)
	}

	// Role badge color — keeps the profile glanceable.
	const rolePalette =
		user.role === 'admin' ? 'red' : user.role === 'moderator' ? 'orange' : 'blue'

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>{user.name} · BBS</title>
			<Nav />

			<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 10 })}>
				{/* Breadcrumb */}
				<Stack direction="horizontal" align="center" gap="2" class={css({ fontSize: 'sm', color: 'muted', mb: 6 })}>
					<Anchor href="/" variant="plain" class={css({ color: 'muted' })}>
						Home
					</Anchor>
					<span aria-hidden>›</span>
					<Text class={css({ color: 'ink', fontWeight: 500 })}>{user.name}</Text>
				</Stack>

				<div class={css({ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 })}>
					{/* ---- main column: activity ---- */}
					<Stack direction="vertical" gap="10">
						{/* Threads */}
						<section>
							<Heading class={css({ mb: 4, fontSize: 'lg', fontWeight: 700 })}>
								Threads started ({threads.length})
							</Heading>
							{threads.length > 0 ? (
								<Stack direction="vertical" gap="1" class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', p: 2 })}>
									{threads.map((t) => (
										<Anchor
											key={t.id}
											href={`/threads/${t.id}`}
											variant="plain"
											class={css({ px: 3, py: 3, rounded: 'lg', _hover: { bg: '#fafafa' }, color: 'ink' })}
										>
											<Text class={css({ fontSize: 'sm', fontWeight: 600, lineClamp: 1 })}>{t.title}</Text>
											<Text class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>
												{t.board_name ?? '—'} · {t.reply_count} replies · {timeAgo(t.updated_at)}
											</Text>
										</Anchor>
									))}
								</Stack>
							) : (
								<Text class={css({ fontSize: 'sm', color: 'faint' })}>No threads started yet.</Text>
							)}
						</section>

						{/* Posts */}
						<section>
							<Heading class={css({ mb: 4, fontSize: 'lg', fontWeight: 700 })}>
								Published posts ({posts.length})
							</Heading>
							{posts.length > 0 ? (
								<Stack direction="vertical" gap="1" class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', p: 2 })}>
									{posts.map((p) => (
										<Anchor
											key={p.id}
											href={`/posts/${p.id}`}
											variant="plain"
											class={css({ px: 3, py: 3, rounded: 'lg', _hover: { bg: '#fafafa' }, color: 'ink' })}
										>
											<Text class={css({ fontSize: 'sm', fontWeight: 600, lineClamp: 1 })}>{p.title}</Text>
											<Text class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>{timeAgo(p.updated_at)}</Text>
										</Anchor>
									))}
								</Stack>
							) : (
								<Text class={css({ fontSize: 'sm', color: 'faint' })}>No published posts yet.</Text>
							)}
						</section>

						{/* Replies */}
						<section>
							<Heading class={css({ mb: 4, fontSize: 'lg', fontWeight: 700 })}>
								Replies ({replies.length})
							</Heading>
							{replies.length > 0 ? (
								<Stack direction="vertical" gap="1" class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', p: 2 })}>
									{replies.map((r) => (
										<Anchor
											key={r.id}
											href={`/threads/${r.threadId}`}
											variant="plain"
											class={css({ px: 3, py: 3, rounded: 'lg', _hover: { bg: '#fafafa' }, color: 'ink' })}
										>
											<Text class={css({ fontSize: 'sm', fontWeight: 600, lineClamp: 1 })}>
												{r.thread_title ?? 'Untitled thread'}
											</Text>
											<Text class={css({ mt: 1, fontSize: 'xs', color: 'muted', lineClamp: 2 })}>{r.body}</Text>
											<Text class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>{timeAgo(r.created_at)}</Text>
										</Anchor>
									))}
								</Stack>
							) : (
								<Text class={css({ fontSize: 'sm', color: 'faint' })}>No replies yet.</Text>
							)}
						</section>
					</Stack>

					{/* ---- sidebar: profile card ---- */}
					<aside>
						<Card class={css({ p: 6, width: 'full', position: 'sticky', top: '5rem' })}>
							<Stack direction="horizontal" align="center" gap="3">
								<span
									class={css({
										display: 'inline-flex',
										alignItems: 'center',
										justifyContent: 'center',
										w: 12,
										h: 12,
										rounded: 'full',
										bg: 'accent',
										color: 'white',
										fontSize: 'lg',
										fontWeight: 700,
										flexShrink: 0,
									})}
								>
									{user.name.charAt(0).toUpperCase()}
								</span>
								<div>
									<Heading class={css({ fontSize: 'xl', fontWeight: 800 })}>{user.name}</Heading>
									<Badge colorPalette={rolePalette} variant="subtle" class={css({ mt: 1, textTransform: 'capitalize' })}>
										{user.role}
									</Badge>
								</div>
							</Stack>

							<Stack direction="vertical" gap="2" class={css({ mt: 6, fontSize: 'sm', color: 'muted' })}>
								<Text class={css({ display: 'flex', alignItems: 'center', gap: 2 })}>
									<span aria-hidden>📧</span>
									{user.email}
								</Text>
								<Text class={css({ display: 'flex', alignItems: 'center', gap: 2 })}>
									<span aria-hidden>🎂</span>
									{user.age} years old
								</Text>
								<Text class={css({ display: 'flex', alignItems: 'center', gap: 2 })}>
									<span aria-hidden>🗓️</span>
									Joined {timeAgo(user.created_at)}
								</Text>
							</Stack>
						</Card>
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
