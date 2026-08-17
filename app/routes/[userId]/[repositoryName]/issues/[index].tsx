import { css } from '../../../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Button, Card, Heading, Stack, Text } from '../../../../components/ui'
import { RepoPageLayout } from '../../../../components/repo-layout'
import { SiteHeader } from '../../../../components/site-header'
import { apiFetch } from '../../../../lib/api'

/**
 * Issue detail — `/{owner}/{repo}/issues/{index}`.
 *
 * Pure SSR, mirrors Forgejo's `/issues/{index}`. Shows the issue header (title,
 * state, poster, timestamps), the body, all comments, and an open/close toggle
 * plus a comment form (both POST → JSON API → redirect).
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

type Issue = {
	id: string
	repoId: string
	posterId: string
	index: number
	title: string
	body: string
	state: 'open' | 'closed'
	is_pull: number
	num_comments: number
	created_at: string
	updated_at: string
}

type Comment = {
	id: string
	issue_id: string
	poster_id: string
	body: string
	created_at: string
	updated_at: string
}

/** Format a timestamp as `Mon DD, YYYY`. */
function formatDate(iso: string): string {
	const t = new Date(iso)
	if (Number.isNaN(t.getTime())) return ''
	return t.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const index = Number(c.req.param('index'))
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

	const payload: any = await apiFetch(c, `/page/repositories/${repository.id}/issues/${index}`)
	const issue: Issue | null = payload?.issue ?? null
	const comments: Comment[] = payload?.comments ?? []

	if (!issue) {
		c.status(404)
		return c.render(
			<RepoPageLayout
				ownerName={ownerName}
				repositoryName={repositoryName}
				repository={repository}
				active="issues"
				children={
					<div class={css({ py: 16, textAlign: 'center' })}>
						<Heading class={css({ fontSize: 'xl', fontWeight: 800 })}>Issue not found</Heading>
						<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
							No issue #{index} in <code class={css({ color: 'accent' })}>{repository.name}</code>.
						</Text>
					</div>
				}
			/>,
		)
	}

	return c.render(
		<RepoPageLayout
			ownerName={ownerName}
			repositoryName={repositoryName}
			repository={repository}
			active="issues"
			breadcrumb={{ branches: undefined, activeRef: defaultBranch, defaultBranch, parts: [{ label: 'issues', href: `${base}/issues` }, { label: `#${issue.index}` }] }}
			children={
				<div class={css({ spaceY: 5 })}>
					{/* Flash */}
					{flashError && (
						<div class={css({ px: 4, py: 3, rounded: 'md', bg: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: 'sm', fontWeight: 600 })}>
							{flashError}
						</div>
					)}

					{/* Header */}
					<div>
						<Stack direction="horizontal" align="center" gap="2" wrap>
							<Heading class={css({ fontSize: 'xl', fontWeight: 800, wordBreak: 'break-word' })}>
								{issue.title}
							</Heading>
							<span
								class={css({
									px: 2.5, py: 1, rounded: 'full', fontSize: 'xs', fontWeight: 700, color: 'white',
									...(issue.state === 'open' ? { bg: '#1a7f37' } : { bg: '#8250df' }),
								})}
							>
								{issue.state}
							</span>
						</Stack>
						<Text class={css({ mt: 2, fontSize: 'xs', color: 'faint' })}>
							#{issue.index} opened {formatDate(issue.created_at)} · {issue.num_comments} comment{issue.num_comments === 1 ? '' : 's'}
						</Text>
					</div>

					{/* Body */}
					<Card class={css({ p: 5, width: 'full' })}>
						<Text class={css({ fontSize: 'sm', color: 'ink', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>
							{issue.body || 'No description provided.'}
						</Text>
					</Card>

					{/* Comments */}
					{comments.length > 0 && (
						<div class={css({ spaceY: 3 })}>
							<Heading class={css({ fontSize: 'lg', fontWeight: 700 })}>Comments</Heading>
							{comments.map((comment) => (
								<Card key={comment.id} class={css({ p: 4, width: 'full' })}>
									<Stack direction="horizontal" justify="between" align="center" class={css({ mb: 2, fontSize: 'xs', color: 'faint' })}>
										<Text as="span" class={css({ fontWeight: 600, color: 'muted' })}>{comment.poster_id}</Text>
										<Text as="span">{formatDate(comment.created_at)}</Text>
									</Stack>
									<Text class={css({ fontSize: 'sm', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>
										{comment.body}
									</Text>
								</Card>
							))}
						</div>
					)}

					{/* Actions + comment form */}
					<Card class={css({ p: 5, width: 'full' })}>
						<Stack direction="horizontal" justify="between" align="center" class={css({ mb: 4 })}>
							<Text class={css({ fontSize: 'sm', fontWeight: 700, color: 'ink' })}>Add a comment</Text>
							<form method="post" action={`${base}/issues/${issue.index}`} class={css({ display: 'inline' })}>
								<input type="hidden" name="action" value="toggle" />
								<Button type="submit" variant="outline" size="sm" class={css({ borderColor: issue.state === 'open' ? '#fecaca' : '#bbf7d0', color: issue.state === 'open' ? '#b91c1c' : '#166534' })}>
									{issue.state === 'open' ? 'Close issue' : 'Reopen issue'}
								</Button>
							</form>
						</Stack>
						<form method="post" action={`${base}/issues/${issue.index}`} class={css({ spaceY: 3 })}>
							<input type="hidden" name="action" value="comment" />
							<textarea
								name="body"
								rows={4}
								placeholder="Leave a comment…"
								class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', resize: 'vertical', _focus: { borderColor: 'accent' } })}
							/>
							<Button type="submit" size="md">Comment</Button>
						</form>
					</Card>
				</div>
			}
		/>,
	)
})

/** POST — dispatch issue actions (toggle open/close, comment). */
export const POST = createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const index = c.req.param('index')
	const form = await c.req.parseBody()
	const action = typeof form.action === 'string' ? form.action : ''
	const base = `/${userId}/${repositoryName}/issues/${index}`

	const page: any = await apiFetch(c, `/page/repositories/by-owner/${encodeURIComponent(userId)}/${encodeURIComponent(repositoryName)}`)
	const repository = page?.repository
	if (!repository) return c.redirect(base)

	if (action === 'toggle') {
		const issue: any = (await getJson(c, `/page/repositories/${repository.id}/issues/${index}`))?.issue
		const next = issue?.state === 'open' ? 'closed' : 'open'
		await postJson(c, `/page/repositories/${repository.id}/issues/${index}/state`, new URLSearchParams({ state: next }).toString())
		return c.redirect(base)
	}

	if (action === 'comment') {
		const body = typeof form.body === 'string' ? form.body.trim() : ''
		if (!body) return c.redirect(`${base}?error=${encodeURIComponent('Comment is empty.')}`)
		await postJson(c, `/page/repositories/${repository.id}/issues/${index}/comments`, new URLSearchParams({ body }).toString())
		return c.redirect(base)
	}

	return c.redirect(base)
})

/** GET a `/page/*` resource and return its `data`. */
async function getJson(c: Parameters<typeof apiFetch>[0], path: string): Promise<Record<string, unknown> | null> {
	try {
		const url = path.startsWith('/api') ? path : `/api${path}`
		const res = await fetch(new Request(new URL(url, c.req.url), {
			headers: { cookie: c.req.header('cookie') ?? '' },
		}))
		return (await res.json())?.data ?? null
	} catch {
		return null
	}
}

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
		console.error('[issue postJson]', err)
	}
}
