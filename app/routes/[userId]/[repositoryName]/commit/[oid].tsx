import { css } from '../../../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Button, Card, Heading, Stack, Text } from '../../../../components/ui'
import { RepoPageLayout } from '../../../../components/repo-layout'
import { DiffView, type CommitDiff } from '../../../../components/diff-view'
import { SiteHeader } from '../../../../components/site-header'
import { apiFetch } from '../../../../lib/api'

/**
 * Single-commit page — `/{owner}/{repo}/commit/{oid}`.
 *
 * Pure SSR, mirrors Forgejo's `/commit/{sha}`. Fetches the commit metadata +
 * its diff against the parent (root commits diff the empty tree) from the JSON
 * API and renders:
 *
 *   - a commit card: message title + body, author, committer, timestamp, short
 *     oid with a link to its tree
 *   - the shared DiffView (stats bar + per-file hunks)
 *   - a "Browse the code at this commit" link
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

type CommitInfo = {
	oid: string
	message: string
	author: { name: string; email: string }
	committer: { name: string; email: string }
	timestamp: number
	parent: string[]
}

/** Split a commit message into title + body. */
function splitMessage(msg: string): { title: string; body: string } {
	const idx = msg.indexOf('\n')
	return idx === -1 ? { title: msg, body: '' } : { title: msg.slice(0, idx), body: msg.slice(idx + 1).trim() }
}

/** Format a unix timestamp as `Mon DD, YYYY`. */
function formatDate(ts: number): string {
	return new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const oid = c.req.param('oid')

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

	// Fetch commit metadata + diff.
	const payload: any = await apiFetch(c, `/page/repositories/${repository.id}/commit/${encodeURIComponent(oid)}`)
	const commit: CommitInfo | null = payload?.commit ?? null
	const diff: CommitDiff | null = payload?.diff ?? null

	if (!commit || !diff) {
		c.status(404)
		return c.render(
			<RepoPageLayout
				ownerName={ownerName}
				repositoryName={repositoryName}
				repository={repository}
				active="commits"
				breadcrumb={{
					branches: undefined,
					activeRef: defaultBranch,
					defaultBranch,
					parts: [{ label: 'commit', href: undefined }],
				}}
				children={
					<div class={css({ py: 16, textAlign: 'center' })}>
						<Heading class={css({ fontSize: 'xl', fontWeight: 800 })}>Commit not found</Heading>
						<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
							<code class={css({ color: 'accent' })}>{oid}</code> does not exist in this repository.
						</Text>
					</div>
				}
			/>,
		)
	}

	const { title, body } = splitMessage(commit.message)
	const shortOid = commit.oid.slice(0, 10)

	return c.render(
		<RepoPageLayout
			ownerName={ownerName}
			repositoryName={repositoryName}
			repository={repository}
			active="commits"
			breadcrumb={{
				branches: undefined,
				activeRef: defaultBranch,
				defaultBranch,
				parts: [{ label: 'commit', href: undefined }, { label: shortOid }],
			}}
			children={
				<div class={css({ spaceY: 6 })}>
					{/* Commit card */}
					<Card class={css({ p: 5, width: 'full' })}>
						<Heading class={css({ fontSize: 'lg', fontWeight: 800, lineHeight: 1.4, wordBreak: 'break-word' })}>
							{title}
						</Heading>
						{body && (
							<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted', whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>
								{body}
							</Text>
						)}
						<Stack direction="horizontal" align="center" gap="3" wrap class={css({ mt: 4, pt: 4, borderTop: '1px solid token(colors.border)', fontSize: 'xs', color: 'faint' })}>
							<Text as="span">
								<strong class={css({ color: 'ink' })}>{commit.author.name}</strong> authored {formatDate(commit.timestamp)}
							</Text>
							{commit.committer.name !== commit.author.name && (
								<Text as="span">
									<strong class={css({ color: 'ink' })}>{commit.committer.name}</strong> committed
								</Text>
							)}
							<code class={css({ fontFamily: 'monospace', color: 'accent' })}>{shortOid}</code>
							<Anchor
								href={`/${ownerName}/${repositoryName}/src/${commit.oid}`}
								variant="plain"
								class={css({ color: 'muted', _hover: { color: 'accent' } })}
							>
								Browse the code at this commit
							</Anchor>
						</Stack>
					</Card>

					{/* Diff */}
					<DiffView diff={diff} />
				</div>
			}
		/>,
	)
})
