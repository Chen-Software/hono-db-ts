import { css } from '../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Badge, Card, Heading, Stack, Text } from '../../components/ui'
import { SiteHeader } from '../../components/site-header'
import { getSession } from '../../../src/auth/context'
import { apiFetch } from '../../lib/api'

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
	const id = c.req.param('id') ?? ''

	// Authenticated + owner-only gate. `__BETTER_AUTH_ENABLED__` is the Vite
	// build-time flag (see vite.ui.config.ts / vite.ui.cf.config.ts): with
	// `BETTER_AUTH_ENABLED=false`, this `if` inlines to `if (false)`, so the
	// guard — and the `getSession` import / better-auth it pulls — is
	// dead-code-eliminated and the page stays public. Otherwise, a missing or
	// invalid session cookie sends the visitor to sign-in (remembering where
	// they were), and a session that does not belong to this profile id is
	// rejected with 403 (you may only view your own profile).
	let sessionUser:
		| { id: string; name: string; email: string; createdAt: string }
		| null = null
	if (__BETTER_AUTH_ENABLED__) {
		const session = await getSession(c)
		if (!session?.user) {
			return c.redirect(`/sign-in?next=/users/${id}`)
		}
		if (session.user.id !== id) {
			return c.json({ error: "forbidden" }, 403)
		}
		sessionUser = {
			id: session.user.id,
			name: session.user.name,
			email: session.user.email,
			createdAt: String(session.user.createdAt),
		}
	}

	let user: UserRow
	let threads: UserThread[] = []
	let posts: UserPost[] = []
	let replies: UserReply[] = []

	// The Better Auth id (e.g. `TX31…`) and the BBS `users` table id (a demo
	// UUID like `e6c0…`) live in two separate id spaces with no linkage yet,
	// so a signed-up account has no BBS `users` row — which used to make this
	// owner-only page 404. Since the page is owner-only we can always derive a
	// profile from the authenticated session; we only enrich it with a BBS row
	// (and that user's activity) when one actually exists. Activity stays empty
	// for a plain Better Auth account (they haven't authored demo content).
	const fallback = (): UserRow => ({
		id,
		name: sessionUser?.name ?? "Member",
		email: sessionUser?.email ?? "",
		role: "member",
		age: 0,
		created_at: sessionUser?.createdAt ?? new Date().toISOString(),
	})

	// SSR: the profile is fetched over HTTP from the JSON API (service layer).
	// The owner-only auth gate above stays in the route; only the data fetch
	// moves behind the service layer. `getProfile` returns the BBS `users` row
	// (or null) plus the activity keyed by this id.
	const profile: any = await apiFetch(c, `/page/users/${id}`)
	if (profile) {
		user = profile.user ?? fallback()
		threads = profile.threads ?? []
		posts = profile.posts ?? []
		replies = profile.replies ?? []
	} else {
		user = fallback()
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
	return <SiteHeader />
}
