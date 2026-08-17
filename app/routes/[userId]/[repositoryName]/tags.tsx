import { css } from '../../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Button, Card, Heading, Stack, Text } from '../../../components/ui'
import { RepoPageLayout } from '../../../components/repo-layout'
import { SiteHeader } from '../../../components/site-header'
import { apiFetch } from '../../../lib/api'

/**
 * Tags page — `/{owner}/{repo}/tags`.
 *
 * Pure SSR, mirrors Forgejo's `/tags` (`repo_tag.go`): lists lightweight and
 * annotated tags (annotated peeled to their commit), with create / delete
 * actions posted to the JSON API and followed by a redirect back.
 */

type Repository = {
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
	topics: string
	numStars: number
	numForks: number
	numOpenIssues: number
	numClosedIssues: number
	size: number
	created_at: string
}

type Owner = { id: string; name: string } | null

type Tag = {
	name: string
	oid: string
	type: 'lightweight' | 'annotated'
	message?: string
}

/** Format a short oid for display. */
function shortOid(oid: string): string {
	return oid.slice(0, 7)
}

export default createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const flashError = c.req.query('error')
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
					<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
						No repository at <code class={css({ color: 'accent' })}>{userId}/{repositoryName}</code>.
					</Text>
					<Button as="a" href="/" size="sm" class={css({ mt: 6 })}>
						Back to home
					</Button>
				</main>
			</div>,
		)
	}

	const ownerName = owner?.name ?? userId
	const defaultBranch = repository.defaultBranch || 'main'
	const base = `/${ownerName}/${repositoryName}`

	const data: any = await apiFetch(c, `/page/repositories/${repository.id}/tags`)
	const tags: Tag[] = data?.tags ?? []

	return c.render(
		<RepoPageLayout
			ownerName={ownerName}
			repositoryName={repositoryName}
			repository={repository}
			active="releases"
			breadcrumb={{ branches: undefined, activeRef: defaultBranch, defaultBranch, parts: [{ label: 'tags', href: undefined }] }}
			children={
				<div class={css({ spaceY: 6 })}>
					{/* Flash */}
					{flashNotice && (
						<div class={css({ px: 4, py: 3, rounded: 'md', bg: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: 'sm', fontWeight: 600 })}>
							{flashNotice}
						</div>
					)}
					{flashError && (
						<div class={css({ px: 4, py: 3, rounded: 'md', bg: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: 'sm', fontWeight: 600 })}>
							{flashError}
						</div>
					)}

					{/* Create tag */}
					<Card class={css({ p: 5, width: 'full' })}>
						<Heading class={css({ fontSize: 'lg', fontWeight: 800 })}>New tag</Heading>
						<form method="post" action={`${base}/tags`} class={css({ mt: 3, display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' })}>
							<input type="hidden" name="action" value="create" />
							<input
								name="name"
								required
								placeholder="v1.0.0"
								class={css({ px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
							/>
							<input
								name="target"
								defaultValue={defaultBranch}
								placeholder="target (branch / commit)"
								class={css({ px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
							/>
							<Button type="submit" size="sm">
								Create tag
							</Button>
						</form>
					</Card>

					{/* Tag list header */}
					<Stack direction="horizontal" justify="between" align="center" class={css({ px: 1 })}>
						<Text class={css({ fontSize: 'sm', color: 'muted' })}>
							<strong class={css({ color: 'ink', fontWeight: 700 })}>{tags.length.toLocaleString()}</strong> tags
						</Text>
					</Stack>

					{/* Tag list */}
					{tags.length > 0 ? (
						<Card class={css({ p: 0, width: 'full', overflow: 'hidden' })}>
							<div class={css({ divideY: '1px solid token(colors.border)' })}>
								{tags.map((tag) => (
									<div key={tag.name} class={css({ px: 4, py: 3 })}>
										<Stack direction="horizontal" justify="between" align="center" gap="3" wrap>
											<Stack direction="horizontal" align="center" gap="2" class={css({ minWidth: 0 })}>
												<span aria-hidden class={css({ color: 'accent' })}>🏷</span>
												<Anchor
													href={`${base}/src/${tag.name}`}
													variant="plain"
													class={css({ fontWeight: 700, color: 'ink', _hover: { color: 'accent' } })}
												>
													{tag.name}
												</Anchor>
												{tag.type === 'annotated' && (
													<span class={css({ px: 1.5, py: 0.5, rounded: 'full', bg: '#f1f5f9', color: 'muted', fontSize: 'xs', fontWeight: 600 })}>
														annotated
													</span>
												)}
											</Stack>
											<form method="post" action={`${base}/tags`} class={css({ display: 'inline' })}>
												<input type="hidden" name="action" value="delete" />
												<input type="hidden" name="name" value={tag.name} />
												<Button type="submit" variant="outline" size="sm" class={css({ borderColor: '#fecaca', color: '#b91c1c' })}>
													Delete
												</Button>
											</form>
										</Stack>
										{tag.message && (
											<Text class={css({ mt: 1, fontSize: 'xs', color: 'faint', truncate: true })}>{tag.message}</Text>
										)}
										<Text class={css({ mt: 0.5, fontSize: 'xs', color: 'faint' })}>
											<Anchor
												href={`${base}/commit/${tag.oid}`}
												variant="plain"
												class={css({ fontFamily: 'monospace', color: 'accent', _hover: { textDecoration: 'underline' } })}
											>
												{shortOid(tag.oid)}
											</Anchor>
										</Text>
									</div>
								))}
							</div>
						</Card>
					) : (
						<Card class={css({ p: 10, width: 'full', textAlign: 'center' })}>
							<Text class={css({ fontSize: 'sm', color: 'muted' })}>No tags yet.</Text>
						</Card>
					)}
				</div>
			}
		/>,
	)
})

/**
 * POST /{owner}/{repo}/tags — dispatch tag actions (create/delete) via the JSON
 * API, then redirect back with a flash.
 */
export const POST = createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const form = await c.req.parseBody()
	const action = typeof form.action === 'string' ? form.action : ''
	const base = `/${userId}/${repositoryName}/tags`

	const page: any = await apiFetch(c, `/page/repositories/by-owner/${encodeURIComponent(userId)}/${encodeURIComponent(repositoryName)}`)
	const repository = page?.repository
	if (!repository) return c.redirect(base)

	if (action === 'create') {
		const name = typeof form.name === 'string' ? form.name.trim() : ''
		const target = typeof form.target === 'string' && form.target.trim() ? form.target.trim() : repository.defaultBranch || 'main'
		if (!name) return c.redirect(`${base}?error=${encodeURIComponent('A tag name is required.')}`)
		const ok = await postJson(c, `/page/repositories/${repository.id}/tags`, new URLSearchParams({ name, target }).toString())
		if (!ok) return c.redirect(`${base}?error=${encodeURIComponent('Could not create the tag.')}`)
		return c.redirect(`${base}?notice=${encodeURIComponent(`Tag ${name} created.`)}`)
	}

	if (action === 'delete') {
		const name = typeof form.name === 'string' ? form.name.trim() : ''
		if (name) await postJson(c, `/page/repositories/${repository.id}/tags/${encodeURIComponent(name)}/delete`, '')
		return c.redirect(`${base}?notice=${encodeURIComponent(`Tag ${name} deleted.`)}`)
	}

	return c.redirect(base)
})

/** POST a form to a `/page/*` mutation and return whether it succeeded. */
async function postJson(c: Parameters<typeof apiFetch>[0], path: string, body: string): Promise<boolean> {
	try {
		const url = path.startsWith('/api') ? path : `/api${path}`
		const res = await fetch(new Request(new URL(url, c.req.url), {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: c.req.header('cookie') ?? '',
			},
			body,
			redirect: 'manual',
		}))
		return res.status >= 200 && res.status < 300
	} catch (err) {
		console.error('[tags postJson]', err)
		return false
	}
}
