import { css } from '../../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Button, Card, Heading, Stack, Text } from '../../../components/ui'
import { RepoPageLayout } from '../../../components/repo-layout'
import { DiffView, type CommitDiff } from '../../../components/diff-view'
import { SiteHeader } from '../../../components/site-header'
import { apiFetch } from '../../../lib/api'

/**
 * Compare page — `/{owner}/{repo}/compare?from=&to=` (Forgejo's
 * `/compare/{base}...{head}`). Shows the unified diff between two refs and a
 * "Create pull request" action (placeholder until PRs land in a later phase).
 * Each changed file links to its blob view at the `to` ref.
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

type Branch = string

export default createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const from = c.req.query('from') || ''
	const to = c.req.query('to') || ''

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

	// Fetch branch list for the from/to pickers.
	const branchRes: any = await apiFetch(c, `/page/repositories/${repository.id}/branches`)
	const branches: Branch[] = branchRes?.branches ?? []

	const base = from || defaultBranch
	const head = to || (branches.find((b) => b !== base) ?? base)

	const compareQs = new URLSearchParams()
	compareQs.set('from', base)
	compareQs.set('to', head)
	const payload: any = await apiFetch(c, `/page/repositories/${repository.id}/compare?${compareQs.toString()}`)
	const diff: CommitDiff | null = payload?.diff ?? null

	const pathHrefFor = (path: string, status: CommitDiff['files'][number]['status']) => {
		if (status === 'deleted') return undefined
		return `/${ownerName}/${repositoryName}/src/${encodeURIComponent(head)}/${path}`
	}

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
				parts: [{ label: 'compare', href: undefined }],
			}}
			children={
				<div class={css({ spaceY: 6 })}>
					{/* Compare controls */}
					<Card class={css({ p: 5, width: 'full' })}>
						<form method="get" class={css({ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' })}>
							<label class={css({ fontSize: 'xs', color: 'faint', textTransform: 'uppercase', letterSpacing: '0.05em' })}>
								Base
							</label>
							<select
								name="from"
								defaultValue={base}
								onchange="this.form.submit()"
								class={css({ rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', px: 2, py: 1.5, fontSize: 'sm', outline: 'none' })}
							>
								{(branches.length ? branches : [defaultBranch]).map((b) => (
									<option key={b} value={b}>
										{b}
									</option>
								))}
							</select>
							<Text as="span" aria-hidden class={css({ color: 'faint' })}>…</Text>
							<label class={css({ fontSize: 'xs', color: 'faint', textTransform: 'uppercase', letterSpacing: '0.05em' })}>
								Head
							</label>
							<select
								name="to"
								defaultValue={head}
								onchange="this.form.submit()"
								class={css({ rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', px: 2, py: 1.5, fontSize: 'sm', outline: 'none' })}
							>
								{(branches.length ? branches : [defaultBranch]).map((b) => (
									<option key={b} value={b}>
										{b}
									</option>
								))}
							</select>
							<Button type="submit" size="sm">
								Compare
							</Button>
						</form>

						<Stack direction="horizontal" align="center" gap="3" class={css({ mt: 4, pt: 4, borderTop: '1px solid token(colors.border)' })}>
							<Button as="a" href={`/repositories/${repository.id}`} size="md" disabled class={css({ opacity: 0.7, cursor: 'not-allowed' })}>
								Create pull request
							</Button>
							<Text class={css({ fontSize: 'xs', color: 'faint' })}>
								Comparing <code class={css({ color: 'accent' })}>{head}</code> into{' '}
								<code class={css({ color: 'accent' })}>{base}</code>. PR creation arrives with the pull-requests phase.
							</Text>
						</Stack>
					</Card>

					{/* Diff */}
					{diff ? (
						<DiffView diff={diff} pathHrefFor={pathHrefFor} />
					) : (
						<Card class={css({ p: 10, width: 'full', textAlign: 'center' })}>
							<Text class={css({ fontSize: 'sm', color: 'muted' })}>Could not load the diff between these refs.</Text>
						</Card>
					)}
				</div>
			}
		/>,
	)
})
