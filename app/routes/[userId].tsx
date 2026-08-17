import { css } from '../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Badge, Card, Heading, Stack, Text } from '../components/ui'
import { SiteHeader } from '../components/site-header'
import { RepositoryDrawer } from '../components/repository-drawer'
import { apiFetch } from '../lib/api'

/**
 * User profile page — `/{owner}` (the canonical forge URL for a member).
 *
 * Pure SSR. Resolves the user by their login name (the same lower-cased owner
 * segment the git transport and `/{owner}/{repo}` URLs use), then lists every
 * repository they own — each linking to the canonical `/{owner}/{repo}` page.
 * Missing profiles 404; a user with no repositories renders an empty state.
 *
 * This is the *public* profile (unlike `/users/:id`, which is an owner-only
 * session-gated page): anyone can view a member's repos, matching how the
 * repo page and home page are world-readable.
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
	numOpenIssues: number
	numClosedIssues: number
	created_at: string
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
	const name = c.req.param('userId')

	// SSR: the profile is fetched over HTTP from the JSON API by login name.
	const profile: any = await apiFetch(c, `/page/users/by-name/${encodeURIComponent(name)}`)
	const user: UserRow | null = profile?.user ?? null
	const repositories: UserRepo[] = profile?.repositories ?? []

	if (!user) {
		c.status(404)
		return c.render(
			<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, sans-serif' })}>
				<title>User not found · CodeForge</title>
				<SiteHeader />
				<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 16, textAlign: 'center' })}>
					<Heading class={css({ fontSize: '2xl', fontWeight: 800 })}>User not found</Heading>
					<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
						No member named <code class={css({ color: 'accent' })}>{name}</code>.
					</Text>
					<Anchor href="/" variant="plain" class={css({ mt: 6, display: 'inline-block', fontSize: 'sm', color: 'accent', fontWeight: 600 })}>
						← Back to home
					</Anchor>
				</main>
			</div>,
		)
	}

	const ownerName = user.name
	const rolePalette = user.role === 'admin' ? 'red' : user.role === 'moderator' ? 'orange' : 'blue'

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>{user.name} · CodeForge</title>
			<SiteHeader />

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
						<Stack direction="horizontal" justify="between" align="center" class={css({ mb: 4 })}>
							<Heading class={css({ fontSize: 'lg', fontWeight: 700 })}>
								Repositories ({repositories.length})
							</Heading>
							<RepositoryDrawer />
						</Stack>

						{repositories.length > 0 ? (
							<Stack direction="vertical" gap="3">
								{repositories.map((r) => {
									const slug = r.lowerName || r.name
									return (
										<Anchor key={r.id} href={`/${ownerName}/${slug}`} variant="plain">
											<Card class={css({ p: 4, width: 'full', _hover: { boxShadow: 'md' } })}>
												<Stack direction="horizontal" align="center" gap="2">
													<span class={css({ w: 2, h: 2, rounded: 'full', bg: 'accent', flexShrink: 0 })} />
													<Heading as="h3" class={css({ fontWeight: 700, fontSize: 'md', truncate: true, color: 'ink' })}>
														{ownerName}/{slug}
													</Heading>
													{r.isPrivate && (
														<Badge variant="subtle" colorPalette="gray">
															private
														</Badge>
													)}
												</Stack>
												<Text class={css({ mt: 1.5, fontSize: 'sm', color: 'muted', lineClamp: 2 })}>
													{r.description || 'No description.'}
												</Text>
												<Stack
													direction="horizontal"
													justify="between"
													align="center"
													class={css({ mt: 2.5, pt: 2.5, borderTop: '1px solid token(colors.border)', fontSize: 'xs', color: 'faint' })}
												>
													<Text as="span">
														<strong class={css({ color: 'ink', fontWeight: 700 })}>{r.numStars}</strong> stars
														{' · '}
														<strong class={css({ color: 'ink', fontWeight: 700 })}>{r.numForks}</strong> forks
													</Text>
													<Text as="span">Updated {timeAgo(r.created_at)}</Text>
												</Stack>
											</Card>
										</Anchor>
									)
								})}
							</Stack>
						) : (
							<div class={css({ py: 16, textAlign: 'center', rounded: 'xl', border: '1px dashed token(colors.border)', bg: 'white' })}>
								<Text class={css({ fontSize: 'sm', color: 'muted' })}>
									{user.name} has no repositories yet.
								</Text>
							</div>
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
								{user.email && (
									<Text class={css({ display: 'flex', alignItems: 'center', gap: 2 })}>
										<span aria-hidden>📧</span>
										{user.email}
									</Text>
								)}
								{user.age > 0 && (
									<Text class={css({ display: 'flex', alignItems: 'center', gap: 2 })}>
										<span aria-hidden>🎂</span>
										{user.age} years old
									</Text>
								)}
								<Text class={css({ display: 'flex', alignItems: 'center', gap: 2 })}>
									<span aria-hidden>🗓️</span>
									Joined {timeAgo(user.created_at)}
								</Text>
							</Stack>
						</Card>
					</aside>
				</div>
			</main>
		</div>,
	)
})
