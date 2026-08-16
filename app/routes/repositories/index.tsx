import { css } from '../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Badge, Card, Heading, Stack, Text } from '../../components/ui'
import { SiteHeader } from '../../components/site-header'
import { RepositoryDrawer } from '../../components/repository-drawer'
import { getSession } from '../../../src/auth/context'
import { apiFetch, apiPostForm } from '../../lib/api'

/**
 * Repositories list page — `/repositories`.
 *
 * Pure SSR. Shows every repository as a card (owner/name, description, stars,
 * forks, private badge) linking to `/repositories/:uuid`. Order is by stars
 * (desc) — the most-starred first — with keyset pagination on that cursor.
 */

type RepositoryRow = {
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
	const cursor = c.req.query('cursor') ?? ''
	// `?new=1` opens the "New repository" drawer on load.
	const newRepo = c.req.query('new') === '1'
	// `?status=` carries post-action feedback back from a form submission.
	const status = c.req.query('status')
	const notice =
		status === 'created'
			? { tone: 'success' as const, text: 'Repository created.' }
			: status === 'error'
				? { tone: 'error' as const, text: 'Could not create the repository. Please try again.' }
				: null

	let repositories: RepositoryRow[] = []
	let total = 0
	let nextCursor: string | null = null

	const session = await getSession(c).catch(() => null)
	void session

	const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
	const page: any = await apiFetch(c, `/page/repositories${q}`)
	if (page) {
		repositories = page.repositories ?? []
		total = page.total ?? 0
		nextCursor = page.nextCursor ?? null
	}

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>Repositories · Git Forge</title>
			<Nav />

			<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 10 })}>
				{notice && (
					<div
						role="status"
						class={css({
							mb: 6,
							px: 4,
							py: 3,
							rounded: 'md',
							fontSize: 'sm',
							fontWeight: 600,
							...(notice.tone === 'success'
								? {
										backgroundColor: '#ecfdf5',
										color: '#047857',
										border: '1px solid #a7f3d0',
									}
								: {
										backgroundColor: '#fef2f2',
										color: '#b91c1c',
										border: '1px solid #fecaca',
									}),
						})}
					>
						{notice.text}
					</div>
				)}
				{/* Heading */}
				<Stack direction="horizontal" justify="between" align="flex-end" wrap gap="4" class={css({ mb: 8 })}>
					<div>
						<Text class={css({ fontSize: 'xs', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'accent' })}>
							Browse code
						</Text>
						<Heading class={css({ mt: 1, fontSize: '2xl', fontWeight: 800 })}>Repositories</Heading>
						<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
							{total.toLocaleString()} repositor{total === 1 ? 'y' : 'ies'} · by stars
						</Text>
					</div>
					<RepositoryDrawer defaultOpen={newRepo} />
				</Stack>

				{/* Repository grid */}
				{repositories.length > 0 ? (
					<div class={css({ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 })}>
						{repositories.map((r) => (
							<Anchor key={r.id} href={`/repositories/${r.id}`} variant="plain">
								<Card
									class={css({
										p: 5,
										width: 'full',
										boxShadow: 'md',
										transition: 'box-shadow 150ms, transform 150ms',
										_hover: {
											boxShadow: '0 8px 24px rgba(17,24,39,0.08)',
											transform: 'translateY(-2px)',
										},
									})}
								>
									<Stack direction="horizontal" align="center" gap="2">
										<span class={css({ w: 2, h: 2, rounded: 'full', bg: 'accent', flexShrink: 0 })} />
										<Heading as="h3" class={css({ fontWeight: 700, fontSize: 'md', truncate: true, color: 'ink' })}>
											{r.owner_name ?? 'unknown'}/{r.name}
										</Heading>
										{r.isPrivate && (
											<Badge variant="subtle" colorPalette="gray">
												private
											</Badge>
										)}
									</Stack>
									<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted', lineClamp: 2, minHeight: '2.5rem' })}>
										{r.description || 'No description.'}
									</Text>
									<Stack
										direction="horizontal"
										justify="between"
										align="center"
										class={css({ mt: 3, pt: 3, borderTop: '1px solid token(colors.border)', fontSize: 'xs', color: 'faint' })}
									>
										<Text as="span">
											<strong class={css({ color: 'ink', fontWeight: 700 })}>{r.numStars}</strong> stars
										</Text>
										<Text as="span">
											<strong class={css({ color: 'ink', fontWeight: 700 })}>{r.numForks}</strong> forks
										</Text>
									</Stack>
								</Card>
							</Anchor>
						))}
					</div>
				) : (
					<div class={css({ py: 16, textAlign: 'center', rounded: 'xl', border: '1px dashed token(colors.border)', bg: 'white' })}>
						<Text class={css({ fontSize: 'sm', color: 'muted' })}>No repositories yet.</Text>
					</div>
				)}

				{/* Pagination */}
				<Stack direction="horizontal" justify="between" align="center" class={css({ mt: 8 })}>
					{cursor ? (
						<Anchor href="/repositories" variant="plain" class={css({ fontSize: 'sm', color: 'accent' })}>
							← Previous
						</Anchor>
					) : (
						<span />
					)}
					{nextCursor && (
						<Anchor
							href={`/repositories?cursor=${encodeURIComponent(nextCursor)}`}
							variant="plain"
							class={css({ fontSize: 'sm', color: 'accent' })}
						>
							Next →
						</Anchor>
					)}
				</Stack>
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

/**
 * POST /repositories — create a new repository. The owning user is the
 * signed-in session (resolved server-side), so the form only sends name /
 * description / isPrivate. On success the user is returned to the list; any
 * failure bounces back with a status flag.
 */
export const POST = createRoute(async (c) => {
	// Repository creation is delegated to the service layer via the JSON API.
	return apiPostForm(c, '/page/repositories')
})
