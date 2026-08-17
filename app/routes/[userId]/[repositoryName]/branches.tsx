import { css } from '../../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Button, Card, Heading, Stack, Text } from '../../../components/ui'
import { RepoPageLayout } from '../../../components/repo-layout'
import { SiteHeader } from '../../../components/site-header'
import { apiFetch } from '../../../lib/api'

/**
 * Branch management — `/{owner}/{repo}/branches`.
 *
 * Pure SSR, mirrors Forgejo's `/branches` (`repo_branch.go`): paginated list of
 * branches with their tip commit, plus create / rename / delete actions (all
 * posted to the JSON API and followed by a redirect back). The default branch
 * is marked and cannot be deleted.
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

type Branch = {
	name: string
	oid: string
	latestCommit?: { oid: string; message: string; author: string; timestamp: number }
}

const PER_PAGE = 30

/** Format a unix timestamp as a short relative age ("3h ago"). */
function timeAgo(ts: number): string {
	const t = ts * 1000
	if (Number.isNaN(t)) return ''
	const s = Math.max(1, Math.floor((Date.now() - t) / 1000))
	if (s < 60) return `${s}s ago`
	const m = Math.floor(s / 60)
	if (m < 60) return `${m}m ago`
	const h = Math.floor(m / 60)
	if (h < 24) return `${h}h ago`
	const d = Math.floor(h / 24)
	if (d < 30) return `${d}d ago`
	return new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** First line of a commit message. */
function firstLine(msg: string): string {
	const idx = msg.indexOf('\n')
	return idx === -1 ? msg : msg.slice(0, idx)
}

export default createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const rawPage = Number(c.req.query('page') || '1')
	const pageNum = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
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

	const listQs = new URLSearchParams()
	listQs.set('page', String(pageNum))
	listQs.set('perPage', String(PER_PAGE))
	const data: any = await apiFetch(c, `/page/repositories/${repository.id}/branches?${listQs.toString()}`)
	const branches: Branch[] = data?.branches ?? []
	const total: number = data?.total ?? branches.length
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

	const pageUrl = (p: number) => `${base}/branches?page=${p}`

	return c.render(
		<RepoPageLayout
			ownerName={ownerName}
			repositoryName={repositoryName}
			repository={repository}
			active="branches"
			breadcrumb={{ branches: undefined, activeRef: defaultBranch, defaultBranch, parts: [{ label: 'branches', href: undefined }] }}
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

					{/* Create branch */}
					<Card class={css({ p: 5, width: 'full' })}>
						<Heading class={css({ fontSize: 'lg', fontWeight: 800 })}>New branch</Heading>
						<form method="post" action={`${base}/branches`} class={css({ mt: 3, display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' })}>
							<input type="hidden" name="action" value="create" />
							<input
								name="name"
								required
								placeholder="branch-name"
								class={css({ px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
							/>
							<select
								name="from"
								defaultValue={defaultBranch}
								class={css({ px: 2, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none' })}
							>
								{branches.map((b) => (
									<option key={b.name} value={b.name}>
										{b.name}
									</option>
								))}
							</select>
							<Button type="submit" size="sm">
								Create branch
							</Button>
						</form>
					</Card>

					{/* Branch list header */}
					<Stack direction="horizontal" justify="between" align="center" class={css({ px: 1 })}>
						<Text class={css({ fontSize: 'sm', color: 'muted' })}>
							<strong class={css({ color: 'ink', fontWeight: 700 })}>{total.toLocaleString()}</strong> branches
						</Text>
						{totalPages > 1 && (
							<Stack direction="horizontal" align="center" gap="1">
								<Button as="a" href={pageNum > 1 ? pageUrl(pageNum - 1) : undefined} variant="outline" size="sm" disabled={pageNum <= 1}>
									← Prev
								</Button>
								<Text class={css({ fontSize: 'xs', color: 'faint', px: 2 })}>{pageNum} / {totalPages}</Text>
								<Button as="a" href={pageNum < totalPages ? pageUrl(pageNum + 1) : undefined} variant="outline" size="sm" disabled={pageNum >= totalPages}>
									Next →
								</Button>
							</Stack>
						)}
					</Stack>

					{/* Branch list */}
					{branches.length > 0 ? (
						<Card class={css({ p: 0, width: 'full', overflow: 'hidden' })}>
							<div class={css({ divideY: '1px solid token(colors.border)' })}>
								{branches.map((branch) => {
									const isDefault = branch.name === defaultBranch
									return (
										<div key={branch.name} class={css({ px: 4, py: 3 })}>
											<Stack direction="horizontal" justify="between" align="center" gap="3" wrap>
												<Stack direction="horizontal" align="center" gap="2" class={css({ minWidth: 0 })}>
													<span aria-hidden class={css({ color: 'accent' })}>⑂</span>
													<Anchor
														href={`${base}/src/${branch.name}`}
														variant="plain"
														class={css({ fontWeight: 700, color: 'ink', _hover: { color: 'accent' } })}
													>
														{branch.name}
													</Anchor>
													{isDefault && (
														<span class={css({ px: 1.5, py: 0.5, rounded: 'full', bg: '#f1f5f9', color: 'muted', fontSize: 'xs', fontWeight: 600 })}>
															default
														</span>
													)}
												</Stack>
												<Stack direction="horizontal" align="center" gap="2">
													{branch.latestCommit && (
														<Text class={css({ fontSize: 'xs', color: 'faint', display: 'none', lg: { display: 'inline' } })}>
															{branch.latestCommit.author} · {timeAgo(branch.latestCommit.timestamp)}
														</Text>
													)}
													{!isDefault && (
														<form method="post" action={`${base}/branches`} class={css({ display: 'inline' })}>
															<input type="hidden" name="action" value="delete" />
															<input type="hidden" name="name" value={branch.name} />
															<Button type="submit" variant="outline" size="sm" class={css({ borderColor: '#fecaca', color: '#b91c1c' })}>
																Delete
															</Button>
														</form>
													)}
												</Stack>
											</Stack>
											{branch.latestCommit && (
												<Text class={css({ mt: 1, fontSize: 'xs', color: 'faint', truncate: true })}>
													{firstLine(branch.latestCommit.message)} ·{' '}
													<Anchor
														href={`${base}/commit/${branch.latestCommit.oid}`}
														variant="plain"
														class={css({ fontFamily: 'monospace', color: 'accent', _hover: { textDecoration: 'underline' } })}
													>
														{branch.latestCommit.oid.slice(0, 7)}
													</Anchor>
												</Text>
											)}
										</div>
									)
								})}
							</div>
						</Card>
					) : (
						<Card class={css({ p: 10, width: 'full', textAlign: 'center' })}>
							<Text class={css({ fontSize: 'sm', color: 'muted' })}>No branches yet.</Text>
						</Card>
					)}

					{/* Footer pagination */}
					{totalPages > 1 && (
						<Stack direction="horizontal" justify="center" align="center" gap="1">
							<Button as="a" href={pageNum > 1 ? pageUrl(pageNum - 1) : undefined} variant="outline" size="sm" disabled={pageNum <= 1}>
								← Prev
							</Button>
							<Text class={css({ fontSize: 'xs', color: 'faint', px: 2 })}>{pageNum} / {totalPages}</Text>
							<Button as="a" href={pageNum < totalPages ? pageUrl(pageNum + 1) : undefined} variant="outline" size="sm" disabled={pageNum >= totalPages}>
								Next →
							</Button>
						</Stack>
					)}
				</div>
			}
		/>,
	)
})

/**
 * POST /{owner}/{repo}/branches — dispatch branch actions (create/delete) via
 * the JSON API, then redirect back with a flash.
 */
export const POST = createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const form = await c.req.parseBody()
	const action = typeof form.action === 'string' ? form.action : ''
	const base = `/${userId}/${repositoryName}/branches`

	const page: any = await apiFetch(c, `/page/repositories/by-owner/${encodeURIComponent(userId)}/${encodeURIComponent(repositoryName)}`)
	const repository = page?.repository
	if (!repository) return c.redirect(base)

	if (action === 'create') {
		const name = typeof form.name === 'string' ? form.name.trim() : ''
		const from = typeof form.from === 'string' && form.from ? form.from : repository.defaultBranch || 'main'
		if (!name) return c.redirect(`${base}?error=${encodeURIComponent('A branch name is required.')}`)
		const ok = await postJson(c, `/page/repositories/${repository.id}/branches`, new URLSearchParams({ name, from }).toString())
		if (!ok) return c.redirect(`${base}?error=${encodeURIComponent('Could not create the branch.')}`)
		return c.redirect(`${base}?notice=${encodeURIComponent(`Branch ${name} created.`)}`)
	}

	if (action === 'delete') {
		const name = typeof form.name === 'string' ? form.name.trim() : ''
		if (name && name !== repository.defaultBranch) {
			await postJson(c, `/page/repositories/${repository.id}/branches/${encodeURIComponent(name)}/delete`, '')
		}
		return c.redirect(`${base}?notice=${encodeURIComponent(`Branch ${name} deleted.`)}`)
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
		console.error('[branches postJson]', err)
		return false
	}
}
