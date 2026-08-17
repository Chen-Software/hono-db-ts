import { css } from '../../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Button, Card, Heading, Stack, Text } from '../../../components/ui'
import { RepoPageLayout } from '../../../components/repo-layout'
import { SiteHeader } from '../../../components/site-header'
import { apiFetch } from '../../../lib/api'

/**
 * Commit history page — `/{owner}/{repo}/commits?ref=&page=` (Forgejo's
 * `/commits/{branch}`). Lists commits for the active ref with pagination; each
 * commit links to its `/{owner}/{repo}/commit/{oid}` diff page.
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

type Commit = {
	oid: string
	message: string
	author: { name: string; email: string }
	committer: { name: string; email: string }
	timestamp: number
	parent: string[]
}

const PER_PAGE = 30

/** First line of a commit message (the title). */
function firstLine(msg: string): string {
	const idx = msg.indexOf('\n')
	return idx === -1 ? msg : msg.slice(0, idx)
}

/** Format a unix timestamp as `Mon DD, YYYY`. */
function formatDate(ts: number): string {
	return new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const ref = c.req.query('ref') || ''
	const rawPage = Number(c.req.query('page') || '1')
	const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1

	const pageRes: any = await apiFetch(c, `/page/repositories/by-owner/${encodeURIComponent(userId)}/${encodeURIComponent(repositoryName)}`)
	const repository: Repository | null = pageRes?.repository ?? null
	const owner: Owner = pageRes?.owner ?? null

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
	const activeRef = ref || defaultBranch

	const commitsQs = new URLSearchParams()
	commitsQs.set('ref', activeRef)
	commitsQs.set('page', String(page))
	const history: any = await apiFetch(c, `/page/repositories/${repository.id}/commits?${commitsQs.toString()}`)
	const commits: Commit[] = history?.commits ?? []
	const total = history?.total ?? commits.length
	const hasMore = commits.length === PER_PAGE

	const qs = (p: number) => {
		const q = new URLSearchParams()
		q.set('ref', activeRef)
		q.set('page', String(p))
		return `/${ownerName}/${repositoryName}/commits?${q.toString()}`
	}

	return c.render(
		<RepoPageLayout
			ownerName={ownerName}
			repositoryName={repositoryName}
			repository={repository}
			active="commits"
			breadcrumb={{
				branches: undefined,
				activeRef,
				defaultBranch,
				parts: [{ label: 'commits', href: undefined }, { label: activeRef }],
			}}
			children={
				<div class={css({ spaceY: 4 })}>
					{/* Summary */}
					<Stack direction="horizontal" justify="between" align="center" class={css({ mb: 2 })}>
						<Heading class={css({ fontSize: 'lg', fontWeight: 800 })}>Commits</Heading>
						<Text class={css({ fontSize: 'xs', color: 'faint' })}>
							{total.toLocaleString()} commit{total === 1 ? '' : 's'} on <code class={css({ color: 'accent' })}>{activeRef}</code>
						</Text>
					</Stack>

					{commits.length > 0 ? (
						<Card class={css({ p: 0, width: 'full', overflow: 'hidden' })}>
							<div class={css({ divideY: '1px solid token(colors.border)' })}>
								{commits.map((commit) => {
									const { oid, author } = commit
									const title = firstLine(commit.message)
									return (
										<Anchor
											key={oid}
											href={`/${ownerName}/${repositoryName}/commit/${oid}`}
											variant="plain"
											class={css({ display: 'block', px: 4, py: 3, _hover: { bg: '#fafafa' }, color: 'ink' })}
										>
											<Stack direction="horizontal" justify="between" align="center" gap="3" wrap>
												<Text class={css({ fontSize: 'sm', fontWeight: 600, color: 'ink', truncate: true, flex: 1, minWidth: 0 })}>
													{title}
												</Text>
												<Text class={css({ fontSize: 'xs', color: 'faint', flexShrink: 0 })}>
													{formatDate(commit.timestamp)}
												</Text>
											</Stack>
											<Stack direction="horizontal" align="center" gap="2" class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>
												<code class={css({ fontFamily: 'monospace', color: 'accent' })}>{oid.slice(0, 7)}</code>
												<span aria-hidden>·</span>
												<Text as="span">{author.name}</Text>
											</Stack>
										</Anchor>
									)
								})}
							</div>
						</Card>
					) : (
						<Card class={css({ p: 10, width: 'full', textAlign: 'center' })}>
							<Text class={css({ fontSize: 'sm', color: 'muted' })}>No commits yet on this ref.</Text>
						</Card>
					)}

					{/* Pagination */}
					{total > PER_PAGE && (
						<Stack direction="horizontal" justify="between" align="center" class={css({ mt: 2 })}>
							{page > 1 ? (
								<Anchor href={qs(page - 1)} variant="plain" class={css({ fontSize: 'sm', color: 'accent', fontWeight: 600 })}>
									← Newer
								</Anchor>
							) : (
								<span />
							)}
							<Text class={css({ fontSize: 'xs', color: 'faint' })}>Page {page}</Text>
							{hasMore ? (
								<Anchor href={qs(page + 1)} variant="plain" class={css({ fontSize: 'sm', color: 'accent', fontWeight: 600 })}>
									Older →
								</Anchor>
							) : (
								<span />
							)}
						</Stack>
					)}
				</div>
			}
		/>,
	)
})
