import { css } from '../../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Button, Card, Heading, Stack, Text } from '../../../components/ui'
import { RepoPageLayout } from '../../../components/repo-layout'
import { SiteHeader } from '../../../components/site-header'
import { apiFetch } from '../../../lib/api'

/**
 * Releases list — `/{owner}/{repo}/releases`.
 *
 * Pure SSR, mirrors Forgejo's `/releases`. Lists releases (newest first) with
 * tag, title, notes, draft/prerelease flags, and a delete action. A "New
 * release" button opens the create form.
 */

type Repository = {
	id: string
	name: string
	lowerName: string
	description: string
	defaultBranch: string
	isPrivate: boolean
	isArchived: boolean
	isMirror: boolean
	isTemplate: boolean
	numStars: number
	numForks: number
	numOpenIssues: number
	numClosedIssues: number
}

type Owner = { id: string; name: string } | null

type Release = {
	id: string
	repoId: string
	publisher_id: string
	tag_name: string
	target: string
	title: string
	note: string
	draft: number
	prerelease: number
	created_at: string
	published_at: string | null
}

function formatDate(iso: string | null): string {
	if (!iso) return 'unpublished'
	const t = new Date(iso)
	if (Number.isNaN(t.getTime())) return ''
	return t.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const flashNotice = c.req.query('notice')

	const page: any = await apiFetch(c, `/page/repositories/by-owner/${encodeURIComponent(userId)}/${encodeURIComponent(repositoryName)}`)
	const repository: Repository | null = page?.repository ?? null
	const owner: Owner = page?.owner ?? null

	if (!repository) {
		c.status(404)
		return c.render(
			<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, sans-serif' })}>
				<title>Repository not found · CodeForge</title>
				<SiteHeader />
				<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 16, textAlign: 'center' })}>
					<Heading class={css({ fontSize: '2xl', fontWeight: 800 })}>Repository not found</Heading>
				</main>
			</div>,
		)
	}

	const ownerName = owner?.name ?? userId
	const defaultBranch = repository.defaultBranch || 'main'
	const base = `/${ownerName}/${repositoryName}`

	const data: any = await apiFetch(c, `/page/repositories/${repository.id}/releases`)
	const releases: Release[] = data?.releases ?? []

	return c.render(
		<RepoPageLayout
			ownerName={ownerName}
			repositoryName={repositoryName}
			repository={repository}
			active="releases"
			breadcrumb={{ branches: undefined, activeRef: defaultBranch, defaultBranch, parts: [{ label: 'releases', href: undefined }] }}
			children={
				<div class={css({ spaceY: 5 })}>
					{flashNotice && (
						<div class={css({ px: 4, py: 3, rounded: 'md', bg: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: 'sm', fontWeight: 600 })}>
							{flashNotice}
						</div>
					)}

					<Stack direction="horizontal" justify="between" align="center" wrap gap="3">
						<Heading class={css({ fontSize: 'lg', fontWeight: 800 })}>Releases ({releases.length})</Heading>
						<Button as="a" href={`${base}/releases/new`} size="md">
							New release
						</Button>
					</Stack>

					{releases.length > 0 ? (
						<div class={css({ spaceY: 3 })}>
							{releases.map((release) => (
								<Card key={release.id} class={css({ p: 5, width: 'full' })}>
									<Stack direction="horizontal" justify="between" align="flex-start" gap="3" wrap>
										<div>
											<Stack direction="horizontal" align="center" gap="2" class={css({ mb: 1 })}>
												<span aria-hidden class={css({ color: 'accent' })}>🏷</span>
												<Anchor
													href={`${base}/src/${release.tag_name}`}
													variant="plain"
													class={css({ fontFamily: 'monospace', fontWeight: 700, color: 'accent', _hover: { textDecoration: 'underline' } })}
												>
													{release.tag_name}
												</Anchor>
												{release.prerelease === 1 && (
													<span class={css({ px: 1.5, py: 0.5, rounded: 'full', bg: '#fef3c7', color: '#92400e', fontSize: 'xs', fontWeight: 600 })}>
														pre-release
													</span>
												)}
												{release.draft === 1 && (
													<span class={css({ px: 1.5, py: 0.5, rounded: 'full', bg: '#f1f5f9', color: 'muted', fontSize: 'xs', fontWeight: 600 })}>
														draft
													</span>
												)}
											</Stack>
											<Text class={css({ fontSize: 'lg', fontWeight: 700, color: 'ink' })}>{release.title}</Text>
											{release.note && (
												<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>
													{release.note}
												</Text>
											)}
											<Text class={css({ mt: 2, fontSize: 'xs', color: 'faint' })}>
												Published {formatDate(release.published_at)}
											</Text>
										</div>
										<form method="post" action={`${base}/releases`} class={css({ display: 'inline' })}>
											<input type="hidden" name="action" value="delete" />
											<input type="hidden" name="tag" value={release.tag_name} />
											<Button type="submit" variant="outline" size="sm" class={css({ borderColor: '#fecaca', color: '#b91c1c' })}>
												Delete
											</Button>
										</form>
									</Stack>
								</Card>
							))}
						</div>
					) : (
						<Card class={css({ p: 10, width: 'full', textAlign: 'center' })}>
							<Text class={css({ fontSize: 'sm', color: 'muted' })}>No releases yet.</Text>
						</Card>
					)}
				</div>
			}
		/>,
	)
})

/** POST — delete a release. */
export const POST = createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const form = await c.req.parseBody()
	const base = `/${userId}/${repositoryName}/releases`

	const page: any = await apiFetch(c, `/page/repositories/by-owner/${encodeURIComponent(userId)}/${encodeURIComponent(repositoryName)}`)
	const repository = page?.repository
	if (!repository) return c.redirect(base)

	const tag = typeof form.tag === 'string' ? form.tag : ''
	if (form.action === 'delete' && tag) {
		await postJson(c, `/page/repositories/${repository.id}/releases/${encodeURIComponent(tag)}/delete`, '')
	}
	return c.redirect(`${base}?notice=${encodeURIComponent(`Release ${tag} deleted.`)}`)
})

/** POST a form to a `/page/*` mutation. */
async function postJson(c: Parameters<typeof apiFetch>[0], path: string, body: string): Promise<void> {
	try {
		const url = path.startsWith('/api') ? path : `/api${path}`
		await fetch(new Request(new URL(url, c.req.url), {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: c.req.header('cookie') ?? '' },
			body,
			redirect: 'manual',
		}))
	} catch (err) {
		console.error('[release postJson]', err)
	}
}
