import { css } from '../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Badge, Button, Card, Heading, Stack, Text } from '../../components/ui'
import { SiteHeader } from '../../components/site-header'
import { RepositoryDrawer } from '../../components/repository-drawer'
import { apiFetch } from '../../lib/api'

/**
 * Repository detail page — `/repositories/:uuid`.
 *
 * Pure SSR. Shows the repository header (owner/name, description, badges,
 * default branch, counters) and a sidebar with the owner, a "New repository"
 * action and an "Edit" link. When the repository is missing the page 404s.
 */

type RepoRow = {
	id: string
	name: string
	lowerName: string
	description: string
	defaultBranch: string
	website: string
	isPrivate: boolean
	isArchived: boolean
	isMirror: boolean
	isTemplate: boolean
	objectFormatName: string
	topics: string
	numStars: number
	numForks: number
	numOpenIssues: number
	numClosedIssues: number
	size: number
	created_at: string
}

type Owner = { id: string; name: string; email: string } | null

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

/** Parse the `topics` JSON column defensively (it is stored as a JSON string). */
function parseTopics(raw: string | undefined): string[] {
	if (!raw) return []
	try {
		const v = JSON.parse(raw)
		return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
	} catch {
		return []
	}
}

export default createRoute(async (c) => {
	const uuid = c.req.param('uuid')

	let repository: RepoRow | null = null
	let owner: Owner = null

	const page: any = await apiFetch(c, `/page/repositories/${uuid}`)
	if (page) {
		repository = page.repository ?? null
		owner = page.owner ?? null
	}

	// 404 when the repository doesn't exist.
	if (!repository) {
		c.status(404)
		return c.render(
			<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, sans-serif' })}>
				<title>Repository not found · Git Forge</title>
				<Nav />
				<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 16, textAlign: 'center' })}>
					<Heading class={css({ fontSize: '2xl', fontWeight: 800 })}>Repository not found</Heading>
					<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
						No repository with id <code>{uuid}</code>.
					</Text>
					<Button as="a" href="/repositories" size="sm" class={css({ mt: 6 })}>
						Back to repositories
					</Button>
				</main>
			</div>,
		)
	}

	const topics = parseTopics(repository.topics)
	const ownerName = owner?.name ?? 'unknown'

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>{ownerName}/{repository.name} · Git Forge</title>
			<Nav />

			<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 10 })}>
				{/* Breadcrumb */}
				<Stack direction="horizontal" align="center" gap="2" class={css({ fontSize: 'sm', color: 'muted', mb: 6 })}>
					<Anchor href="/" variant="plain" class={css({ color: 'muted' })}>
						Home
					</Anchor>
					<span aria-hidden>›</span>
					<Anchor href="/repositories" variant="plain" class={css({ color: 'muted' })}>
						Repositories
					</Anchor>
					<span aria-hidden>›</span>
					<Text class={css({ color: 'ink', fontWeight: 500 })}>{ownerName}/{repository.name}</Text>
				</Stack>

				<div class={css({ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 })}>
					{/* ---- main column ---- */}
					<div>
						{/* Header */}
						<Card class={css({ p: 6, mb: 8, width: 'full' })}>
							<Stack direction="horizontal" align="center" gap="2">
								<span class={css({ w: 3, h: 3, rounded: 'full', bg: 'accent', flexShrink: 0 })} />
								<Heading as="h1" class={css({ fontWeight: 800, fontSize: '2xl', letterSpacing: '-0.01em', truncate: true })}>
									{ownerName}/{repository.name}
								</Heading>
								{repository.isPrivate && (
									<Badge variant="subtle" colorPalette="gray">
										private
									</Badge>
								)}
							</Stack>
							<Text class={css({ mt: 2, maxWidth: 'xl', fontSize: 'sm', color: 'muted', lineHeight: 1.6 })}>
								{repository.description || 'No description.'}
							</Text>

							<Stack direction="horizontal" align="center" gap="2" wrap class={css({ mt: 4, gap: 2 })}>
								{repository.isArchived && (
									<Badge variant="subtle" colorPalette="gray">
										archived
									</Badge>
								)}
								{repository.isMirror && (
									<Badge variant="subtle" colorPalette="blue">
										mirror
									</Badge>
								)}
								{repository.isTemplate && (
									<Badge variant="subtle" colorPalette="purple">
										template
									</Badge>
								)}
								{repository.objectFormatName && (
									<Badge variant="subtle" colorPalette="gray">
										{repository.objectFormatName}
									</Badge>
								)}
							</Stack>

							{topics.length > 0 && (
								<Stack direction="horizontal" align="center" gap="2" wrap class={css({ mt: 4 })}>
									{topics.map((t) => (
										<Badge key={t} variant="outline">
											{t}
										</Badge>
									))}
								</Stack>
							)}

							<Stack direction="horizontal" align="center" gap="5" class={css({ mt: 5, fontSize: 'xs', color: 'faint' })}>
								<Text as="span" class={css({ display: 'flex', alignItems: 'center', gap: 1 })}>
									<span aria-hidden>🌿</span>
									{repository.defaultBranch || 'main'}
								</Text>
								{repository.website && (
									<Anchor href={repository.website} variant="plain" class={css({ color: 'muted' })}>
										{repository.website}
									</Anchor>
								)}
								{owner && (
									<Anchor href={`/users/${owner.id}`} variant="plain" class={css({ color: 'muted' })}>
										Owner: {owner.name}
									</Anchor>
								)}
								<Text as="span">Created {timeAgo(repository.created_at)}</Text>
							</Stack>
						</Card>

						{/* Counters */}
						<section class={css({ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 })}>
							<Card class={css({ p: 5, textAlign: 'center' })}>
								<Text class={css({ fontSize: '2xl', fontWeight: 800, color: 'ink' })}>{repository.numStars}</Text>
								<Text class={css({ mt: 1, fontSize: 'xs', color: 'faint', textTransform: 'uppercase', letterSpacing: '0.06em' })}>Stars</Text>
							</Card>
							<Card class={css({ p: 5, textAlign: 'center' })}>
								<Text class={css({ fontSize: '2xl', fontWeight: 800, color: 'ink' })}>{repository.numForks}</Text>
								<Text class={css({ mt: 1, fontSize: 'xs', color: 'faint', textTransform: 'uppercase', letterSpacing: '0.06em' })}>Forks</Text>
							</Card>
							<Card class={css({ p: 5, textAlign: 'center' })}>
								<Text class={css({ fontSize: '2xl', fontWeight: 800, color: 'ink' })}>{repository.numOpenIssues}</Text>
								<Text class={css({ mt: 1, fontSize: 'xs', color: 'faint', textTransform: 'uppercase', letterSpacing: '0.06em' })}>Open issues</Text>
							</Card>
							<Card class={css({ p: 5, textAlign: 'center' })}>
								<Text class={css({ fontSize: '2xl', fontWeight: 800, color: 'ink' })}>{repository.numClosedIssues}</Text>
								<Text class={css({ mt: 1, fontSize: 'xs', color: 'faint', textTransform: 'uppercase', letterSpacing: '0.06em' })}>Closed issues</Text>
							</Card>
						</section>
					</div>

					{/* ---- sidebar ---- */}
					<aside class={css({ spaceY: 8 })}>
						{owner && (
							<Card class={css({ p: 6, width: 'full' })}>
								<Text class={css({ fontSize: 'xs', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'faint' })}>
									Owner
								</Text>
								<Stack direction="horizontal" align="center" gap="3" class={css({ mt: 3 })}>
									<span
										class={css({
											display: 'inline-flex',
											alignItems: 'center',
											justifyContent: 'center',
											w: 10,
											h: 10,
											rounded: 'full',
											bg: 'accent',
											color: 'white',
											fontSize: 'md',
											fontWeight: 700,
											flexShrink: 0,
										})}
									>
										{owner.name.charAt(0).toUpperCase()}
									</span>
									<Anchor href={`/users/${owner.id}`} variant="plain" class={css({ fontWeight: 700, color: 'ink' })}>
										{owner.name}
									</Anchor>
								</Stack>
							</Card>
						)}

						<Stack direction="vertical" gap="2">
							<RepositoryDrawer
								trigger={
									<Button as="a" href="/repositories?new=1" size="sm" class={css({ width: 'full' })}>
										New repository
									</Button>
								}
							/>
							<Button as="a" href={`/repositories/${repository.id}/edit`} variant="outline" size="sm" class={css({ width: 'full' })}>
								Edit repository
							</Button>
						</Stack>
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
