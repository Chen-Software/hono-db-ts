import { css } from '../../../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Button, Card, Heading, Stack, Text } from '../../../../components/ui'
import { RepoPageLayout } from '../../../../components/repo-layout'
import { SiteHeader } from '../../../../components/site-header'
import { apiFetch } from '../../../../lib/api'

/**
 * New release — `/{owner}/{repo}/releases/new`.
 *
 * Pure SSR. Form for tag name, target commit-ish (defaults to default branch),
 * title, release notes, and draft/prerelease flags. POSTs to the JSON API (via
 * this page's POST handler) then redirects back to the releases list.
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

export default createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const flashError = c.req.query('error')

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

	return c.render(
		<RepoPageLayout
			ownerName={ownerName}
			repositoryName={repositoryName}
			repository={repository}
			active="releases"
			breadcrumb={{ branches: undefined, activeRef: defaultBranch, defaultBranch, parts: [{ label: 'releases', href: `${base}/releases` }, { label: 'new' }] }}
			children={
				<Card class={css({ p: 6, width: 'full' })}>
					<Heading class={css({ fontSize: 'lg', fontWeight: 800 })}>New release</Heading>
					<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>Tag a point in history and publish release notes.</Text>

					{flashError && (
						<div class={css({ mt: 4, px: 4, py: 3, rounded: 'md', bg: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: 'sm', fontWeight: 600 })}>
							{flashError}
						</div>
					)}

					<form method="post" action={`${base}/releases/new`} class={css({ mt: 5, spaceY: 4 })}>
						<div>
							<label class={css({ display: 'block', mb: 1, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>Tag name</label>
							<input name="tagName" required placeholder="v1.0.0"
								class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
							/>
						</div>
						<div>
							<label class={css({ display: 'block', mb: 1, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>Target (branch or commit)</label>
							<input name="target" defaultValue={defaultBranch} placeholder={defaultBranch}
								class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
							/>
						</div>
						<div>
							<label class={css({ display: 'block', mb: 1, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>Release title</label>
							<input name="title" placeholder="Release title (defaults to the tag)"
								class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
							/>
						</div>
						<div>
							<label class={css({ display: 'block', mb: 1, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>Release notes</label>
							<textarea name="note" rows={8} placeholder="What changed in this release?" class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', resize: 'vertical', _focus: { borderColor: 'accent' } })}
							/>
						</div>
						<div class={css({ spaceY: 2 })}>
							<label class={css({ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'sm', cursor: 'pointer' })}>
								<input type="checkbox" name="draft" class={css({ accentColor: 'accent' })} />
								<span>This is a draft</span>
							</label>
							<label class={css({ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'sm', cursor: 'pointer' })}>
								<input type="checkbox" name="prerelease" class={css({ accentColor: 'accent' })} />
								<span>This is a pre-release</span>
							</label>
						</div>
						<Stack direction="horizontal" align="center" gap="3">
							<Button type="submit" size="md">Publish release</Button>
							<a href={`${base}/releases`} class={css({ px: 4, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', color: 'muted', textDecoration: 'none' })}>
								Cancel
							</a>
						</Stack>
					</form>
				</Card>
			}
		/>,
	)
})

/** POST — create the release, then redirect back to the releases list. */
export const POST = createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const form = await c.req.parseBody()
	const base = `/${userId}/${repositoryName}/releases`

	const page: any = await apiFetch(c, `/page/repositories/by-owner/${encodeURIComponent(userId)}/${encodeURIComponent(repositoryName)}`)
	const repository = page?.repository
	if (!repository) return c.redirect(base)

	const tagName = typeof form.tagName === 'string' ? form.tagName.trim() : ''
	const target = typeof form.target === 'string' && form.target.trim() ? form.target.trim() : repository?.defaultBranch || 'main'
	if (!tagName) return c.redirect(`${base}/new?error=${encodeURIComponent('A tag name is required.')}`)

	const body = new URLSearchParams()
	body.set('tagName', tagName)
	body.set('target', target)
	if (typeof form.title === 'string' && form.title) body.set('title', form.title)
	if (typeof form.note === 'string') body.set('note', form.note)
	if (form.draft) body.set('draft', 'on')
	if (form.prerelease) body.set('prerelease', 'on')

	const ok = await postJsonOk(c, `/page/repositories/${repository.id}/releases`, body.toString())
	if (!ok) return c.redirect(`${base}/new?error=${encodeURIComponent('Could not create the release (is the tag already released?).')}`)
	return c.redirect(`${base}?notice=${encodeURIComponent(`Release ${tagName} published.`)}`)
})

/** POST a form to a `/page/*` mutation; returns success. */
async function postJsonOk(c: Parameters<typeof apiFetch>[0], path: string, body: string): Promise<boolean> {
	try {
		const url = path.startsWith('/api') ? path : `/api${path}`
		const res = await fetch(new Request(new URL(url, c.req.url), {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: c.req.header('cookie') ?? '' },
			body,
			redirect: 'manual',
		}))
		return res.status >= 200 && res.status < 300
	} catch (err) {
		console.error('[new release postJson]', err)
		return false
	}
}
