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
 * email, role, age, joined) plus their repositories — the forge equivalent of
 * the forum's threads/posts/replies activity. Every repository row links to the
 * repository page.
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

type UserRepo = {
	id: string
	name: string
	lowerName: string
	description: string
	isPrivate: boolean
	numStars: number
	numForks: number
	owner_name: string | null
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
	let repositories: UserRepo[] = []

	// The Better Auth id (e.g. `TX31…`) and the `users` table id (a demo
	// UUID like `e6c0…`) live in two separate id spaces with no linkage yet,
	// so a signed-up account has no `users` row — which used to make this
	// owner-only page 404. Since the page is owner-only we can always derive a
	// profile from the authenticated session; we only enrich it with a `users`
	// row (and that user's repositories) when one actually exists.
	const fallback = (): UserRow => ({
		id,
		name: sessionUser?.name ?? "Member",
		email: sessionUser?.email ?? "",
		role: "member",
		age: 0,
		created_at: sessionUser?.createdAt ?? new Date().toISOString(),
	})

	// SSR: the profile is fetched over HTTP from the JSON API (service layer).
	const profile: any = await apiFetch(c, `/page/users/${id}`)
	if (profile) {
		user = profile.user ?? fallback()
		repositories = profile.repositories ?? []
	} else {
		user = fallback()
	}

	// Role badge color — keeps the profile glanceable.
	const rolePalette =
		user.role === 'admin' ? 'red' : user.role === 'moderator' ? 'orange' : 'blue'

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>{user.name} · Git Forge</title>
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
					{/* ---- main column: repositories ---- */}
					<section>
						<Heading class={css({ mb: 4, fontSize: 'lg', fontWeight: 700 })}>
							Repositories ({repositories.length})
						</Heading>
						{repositories.length > 0 ? (
							<Stack direction="vertical" gap="1" class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', p: 2 })}>
								{repositories.map((r) => (
									<Anchor
										key={r.id}
										href={`/repositories/${r.id}`}
										variant="plain"
										class={css({ px: 3, py: 3, rounded: 'lg', _hover: { bg: '#fafafa' }, color: 'ink' })}
									>
										<Text class={css({ fontSize: 'sm', fontWeight: 600, lineClamp: 1 })}>
											{r.owner_name ?? 'unknown'}/{r.name}
										</Text>
										<Text class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>
											{r.numStars} stars · {r.numForks} forks
										</Text>
									</Anchor>
								))}
							</Stack>
						) : (
							<Text class={css({ fontSize: 'sm', color: 'faint' })}>No repositories yet.</Text>
						)}
					</section>

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
						<span class={css({ fontWeight: 700, color: 'ink' })}>Git Forge</span> — model-driven forge demo.
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
