import { css } from '../../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Button, Card, Heading, Stack, Text } from '../../../components/ui'
import { RepoPageLayout } from '../../../components/repo-layout'
import { SiteHeader } from '../../../components/site-header'
import { apiFetch } from '../../../lib/api'

/**
 * Issues list — `/{owner}/{repo}/issues?state=&page=`.
 *
 * Pure SSR, mirrors Forgejo's `/issues` (`issue.go`). Lists issues (open/closed
 * toggle + pagination), each linking to its detail page
 * `/{owner}/{repo}/issues/{index}`. A "New issue" button opens the create form.
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

const PER_PAGE = 30

/** Format a timestamp as a short relative age ("3h ago"). */
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
	return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const rawState = c.req.query('state')
	const state = rawState === 'closed' ? 'closed' : 'open'
	const rawPage = Number(c.req.query('page') || '1')
	const pageNum = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1

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
	listQs.set('state', state)
	listQs.set('page', String(pageNum))
	const data: any = await apiFetch(c, `/page/repositories/${repository.id}/issues?${listQs.toString()}`)
	const issues: Issue[] = data?.issues ?? []
	const total: number = data?.total ?? issues.length
	const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

	const pageUrl = (p: number, s: string) => `${base}/issues?state=${s}&page=${p}`

	return c.render(
		<RepoPageLayout
			ownerName={ownerName}
			repositoryName={repositoryName}
			repository={repository}
			active="issues"
			breadcrumb={{ branches: undefined, activeRef: defaultBranch, defaultBranch, parts: [{ label: 'issues', href: undefined }] }}
			children={
				<div class={css({ spaceY: 5 })}>
					{/* Header + new issue */}
					<Stack direction="horizontal" justify="between" align="center" wrap gap="3">
						<Stack direction="horizontal" align="center" gap="1" class={css({ rounded: 'md', border: '1px solid token(colors.border)', overflow: 'hidden' })}>
							<Anchor
								href={pageUrl(1, 'open')}
								variant="plain"
								class={css({
									px: 3, py: 2, fontSize: 'sm', fontWeight: 600,
									...(state === 'open' ? { bg: '#ececee', color: 'ink' } : { color: 'muted' }),
								})}
							>
								Open ({repository.numOpenIssues})
							</Anchor>
							<Anchor
								href={pageUrl(1, 'closed')}
								variant="plain"
								class={css({
									px: 3, py: 2, fontSize: 'sm', fontWeight: 600,
									...(state === 'closed' ? { bg: '#ececee', color: 'ink' } : { color: 'muted' }),
								})}
							>
								Closed ({repository.numClosedIssues})
							</Anchor>
						</Stack>
						<Button as="a" href={`${base}/issues/new`} size="md">
							New issue
						</Button>
					</Stack>

					{/* List */}
					{issues.length > 0 ? (
						<Card class={css({ p: 0, width: 'full', overflow: 'hidden' })}>
							<div class={css({ divideY: '1px solid token(colors.border)' })}>
								{issues.map((issue) => (
									<Anchor
										key={issue.id}
										href={`${base}/issues/${issue.index}`}
										variant="plain"
										class={css({ display: 'block', px: 4, py: 3, _hover: { bg: '#fafafa' }, color: 'ink' })}
									>
										<Stack direction="horizontal" justify="between" align="center" gap="3" wrap>
											<Stack direction="horizontal" align="center" gap="2" class={css({ minWidth: 0 })}>
												<span
													aria-hidden
													class={css({
														fontSize: 'md',
														...(issue.state === 'open'
															? { color: '#1a7f37' }
															: { color: '#8250df' }),
													})}
												>
													{issue.state === 'open' ? '◉' : '✕'}
												</span>
												<Text class={css({ fontSize: 'sm', fontWeight: 600, truncate: true })}>
													{issue.title}
												</Text>
												{issue.is_pull === 1 && (
													<span class={css({ px: 1.5, py: 0.5, rounded: 'full', bg: '#f1f5f9', color: 'muted', fontSize: 'xs', fontWeight: 600 })}>
														pull request
													</span>
												)}
											</Stack>
											<Text class={css({ fontSize: 'xs', color: 'faint', flexShrink: 0 })}>
												#{issue.index} · {timeAgo(issue.created_at)} · {issue.num_comments} comment{issue.num_comments === 1 ? '' : 's'}
											</Text>
										</Stack>
									</Anchor>
								))}
							</div>
						</Card>
					) : (
						<Card class={css({ p: 10, width: 'full', textAlign: 'center' })}>
							<Text class={css({ fontSize: 'sm', color: 'muted' })}>
								{state === 'open' ? 'No open issues yet.' : 'No closed issues.'}
							</Text>
						</Card>
					)}

					{/* Pagination */}
					{totalPages > 1 && (
						<Stack direction="horizontal" justify="center" align="center" gap="1">
							<Button as="a" href={pageNum > 1 ? pageUrl(pageNum - 1, state) : undefined} variant="outline" size="sm" disabled={pageNum <= 1}>
								← Prev
							</Button>
							<Text class={css({ fontSize: 'xs', color: 'faint', px: 2 })}>{pageNum} / {totalPages}</Text>
							<Button as="a" href={pageNum < totalPages ? pageUrl(pageNum + 1, state) : undefined} variant="outline" size="sm" disabled={pageNum >= totalPages}>
								Next →
							</Button>
						</Stack>
					)}
				</div>
			}
		/>,
	)
})
