import { css } from '../../../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Button, Card, Heading, Stack, Text } from '../../../../components/ui'
import { RepoPageLayout } from '../../../../components/repo-layout'
import { SiteHeader } from '../../../../components/site-header'
import { apiFetch } from '../../../../lib/api'

/**
 * New issue — `/{owner}/{repo}/issues/new`.
 *
 * Pure SSR. Renders a create form that POSTs to the JSON API (which forwards to
 * the service layer), then redirects to the created issue. Requires a session
 * to set the poster.
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
					<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
						No repository at <code class={css({ color: 'accent' })}>{userId}/{repositoryName}</code>.
					</Text>
				</main>
			</div>,
		)
	}

	const ownerName = owner?.name ?? userId
	const base = `/${ownerName}/${repositoryName}`

	return c.render(
		<RepoPageLayout
			ownerName={ownerName}
			repositoryName={repositoryName}
			repository={repository}
			active="issues"
			breadcrumb={{ branches: undefined, activeRef: repository.defaultBranch || 'main', defaultBranch: repository.defaultBranch || 'main', parts: [{ label: 'issues', href: `${base}/issues` }, { label: 'new' }] }}
			children={
				<Card class={css({ p: 6, width: 'full' })}>
					<Heading class={css({ fontSize: 'lg', fontWeight: 800 })}>New issue</Heading>
					<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>Describe a problem or propose an improvement.</Text>

					<form method="post" action={`${base}/issues/new`} class={css({ mt: 5, spaceY: 4 })}>
						<input name="title" required placeholder="Issue title" maxLength={255}
							class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
						/>
						<textarea name="body" rows={8} placeholder="Add a description…" class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', resize: 'vertical', _focus: { borderColor: 'accent' } })}
						/>
						<Stack direction="horizontal" align="center" gap="3">
							<Button type="submit" size="md">Create issue</Button>
							<a href={`${base}/issues`} class={css({ px: 4, py: 2, rounded: 'md', border: '1px solid token(colors.border)', fontSize: 'sm', color: 'muted', textDecoration: 'none' })}>
								Cancel
							</a>
						</Stack>
					</form>
				</Card>
			}
		/>,
	)
})

/** POST /{owner}/{repo}/issues/new — create the issue, then redirect to it. */
export const POST = createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const form = await c.req.parseBody()
	const base = `/${userId}/${repositoryName}`

	const page: any = await apiFetch(c, `/page/repositories/by-owner/${encodeURIComponent(userId)}/${encodeURIComponent(repositoryName)}`)
	const repository = page?.repository
	if (!repository) return c.redirect(`${base}/issues`)

	const title = typeof form.title === 'string' ? form.title.trim() : ''
	if (!title) return c.redirect(`${base}/issues/new`)

	const body = new URLSearchParams()
	body.set('title', title)
	if (typeof form.body === 'string') body.set('body', form.body)
	const data = await postJson(c, `/page/repositories/${repository.id}/issues`, body.toString())
	const index = data?.issue?.index
	return c.redirect(index ? `${base}/issues/${index}` : `${base}/issues`)
})

/** POST a form to a `/page/*` mutation and return its JSON `data`. */
async function postJson(c: Parameters<typeof apiFetch>[0], path: string, body: string): Promise<Record<string, unknown> | null> {
	try {
		const url = path.startsWith('/api') ? path : `/api${path}`
		const res = await fetch(new Request(new URL(url, c.req.url), {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: c.req.header('cookie') ?? '' },
			body,
			redirect: 'manual',
		}))
		const text = await res.text()
		if (!text) return null
		return JSON.parse(text)?.data ?? null
	} catch (err) {
		console.error('[new issue postJson]', err)
		return null
	}
}
