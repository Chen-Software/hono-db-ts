import { css } from '../../design-system/css'
import { createRoute } from 'honox/factory'
import {
	Anchor,
	Badge,
	Card,
	Heading,
	Stack,
	Text,
} from '../components/ui'
import { SiteHeader } from '../components/site-header'
import { RepositoryDrawer } from '../components/repository-drawer'
import { apiFetch, apiPostForm } from '../lib/api'

/**
 * Forge home page — a Git-forge landing UI rendered entirely on the server.
 *
 * Everything is read over HTTP from the JSON query app mounted under `/api`
 * (the service layer runs every query through Drizzle), so the page works with
 * zero client JS: stats, repository cards and the owner picker are all SSR
 * queries. When `DATABASE_URL` is unset (or a query fails) the sections degrade
 * to an empty state instead of crashing.
 */

type Stats = {
	users: number
	repositories: number
}

type Repository = {
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

	// SSR: data is fetched over HTTP from the JSON API (`/api/page/*`), which
	// delegates to the service layer. The UI never opens a SQL connection.
	let stats: Stats | null = null
	let repositories: Repository[] = []
	const home: any = await apiFetch(c, '/page/home')
	if (home) {
		stats = home.stats ?? null
		repositories = home.repositories ?? []
	}

	const hasDb = stats !== null
	const statItems: { label: string; value: number }[] = [
		{ label: 'Members', value: stats?.users ?? 0 },
		{ label: 'Repositories', value: stats?.repositories ?? 0 },
	]

	return c.render(
		<div
			class={css({
				minHeight: '100vh',
				bg: '#f7f7f8',
				color: 'ink',
				fontFamily:
					'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
			})}
		>
			<title>Git Forge</title>

			{/* ---------- Nav ---------- */}
			<SiteHeader variant="home" />

			{/* ---------- Hero / stats ---------- */}
			<section class={css({ px: 6, py: 14, bg: '#111827', color: 'white' })}>
				<div class={css({ maxWidth: '6xl', mx: 'auto' })}>
					<Badge class={css({ textTransform: 'uppercase', letterSpacing: '0.05em' })}>
						Self-hosted Git forge
					</Badge>
					<Heading as="h1" class={css({ mt: 4, fontSize: '4xl', fontWeight: 800, letterSpacing: '-0.02em', color: 'white' })}>
						Welcome to the Forge
					</Heading>
					<Text class={css({ mt: 3, maxWidth: '2xl', color: '#9ca3af', fontSize: 'lg' })}>
						A model-driven Git forge — repositories, owners and stars served straight
						from SQL. Create a repository and start collaborating.
					</Text>

					{hasDb ? (
						<div class={css({ mt: 10, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 })}>
							{statItems.map((s) => (
								<Card
									key={s.label}
									class={css({
										px: 5,
										py: 5,
										bg: 'rgba(255,255,255,0.06)',
										border: '1px solid rgba(255,255,255,0.1)',
										boxShadow: 'none',
									})}
								>
									<Text class={css({ fontSize: '3xl', fontWeight: 800, color: 'white' })}>
										{s.value.toLocaleString()}
									</Text>
									<Text class={css({ mt: 1, fontSize: 'xs', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' })}>
										{s.label}
									</Text>
								</Card>
							))}
						</div>
					) : (
						<Card
							class={css({
								mt: 8,
								px: 5,
								py: 4,
								bg: 'rgba(255,255,255,0.06)',
								border: '1px solid rgba(255,255,255,0.1)',
								boxShadow: 'none',
							})}
						>
							<Text class={css({ fontSize: 'sm', color: '#9ca3af' })}>
								No database connection — set <code class={css({ color: '#fdba74' })}>DATABASE_URL</code> and
								run <code class={css({ color: '#fdba74' })}>db:seed</code> to see live data.
							</Text>
						</Card>
					)}
				</div>
			</section>

			{/* ---------- Body ---------- */}
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

				<Stack direction="horizontal" justify="between" align="flex-end" wrap gap="4" class={css({ mb: 8 })}>
					<div>
						<Text class={css({ fontSize: 'xs', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'accent' })}>
							Explore
						</Text>
						<Heading class={css({ mt: 1, fontSize: '2xl', fontWeight: 800 })}>Repositories</Heading>
						<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
							{((stats?.repositories ?? 0)).toLocaleString()} repositor{stats?.repositories === 1 ? 'y' : 'ies'} · by stars
						</Text>
					</div>
					{hasDb ? (
						<RepositoryDrawer defaultOpen={newRepo} />
					) : null}
				</Stack>

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
			</main>

			{/* ---------- Footer ---------- */}
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

/**
 * POST / — handle the repository create form. Pure SSR: the submit is a
 * `<form method="post">`, so no client JS is required. On success it redirects
 * back to `/`.
 */
export const POST = createRoute(async (c) => {
	// Repository creation is delegated to the service layer via the JSON API.
	return apiPostForm(c, '/page/repositories')
})
