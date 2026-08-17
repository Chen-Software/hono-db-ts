import { css } from '../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Badge, Button, Card, Code, Heading, Stack, Text } from '../../components/ui'
import { SiteHeader } from '../../components/site-header'
import { RepositoryDrawer } from '../../components/repository-drawer'
import { apiFetch } from '../../lib/api'

/**
 * Repository page — `/{owner}/{repo}` (the canonical Forge URL).
 *
 * Pure SSR. Resolves the repository by its owner login + lower-cased name (the
 * same lookup the git smart-HTTP transport uses, so the web URL and the clone
 * URL always agree), then renders a GitHub/Gitea-style repo home:
 *
 *   - repo header: owner/name, description, badges, star/fork/issue counters
 *   - a branch selector (`?ref=`) and directory breadcrumb (`?path=`)
 *   - the file tree for the current ref:path
 *   - the root README rendered as pre-formatted text (no JS / no markdown dep)
 *   - the recent commit history
 *   - a sidebar with the clone URL and the owning user
 *
 * `?ref=` and `?path=` come straight off the query string; the tree/readme/
 * commits are fetched over HTTP from the JSON API (service layer) exactly like
 * the other SSR pages. Missing repositories 404; empty repos render an empty
 * state instead of crashing.
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
	objectFormatName: string
	topics: string
	numStars: number
	numForks: number
	numOpenIssues: number
	numClosedIssues: number
	size: number
	created_at: string
}

type Owner = { id: string; name: string; email?: string } | null

type TreeEntry = { name: string; type: 'blob' | 'tree'; oid: string; mode: string }

type Commit = {
	oid: string
	message: string
	author: { name: string; email: string }
	timestamp: number
	parent: string[]
}

/** Format an ISO timestamp as a short relative age ("3h ago"). */
function timeAgo(isoOrTs: string | number): string {
	const t = typeof isoOrTs === 'number' ? isoOrTs * 1000 : new Date(isoOrTs).getTime()
	if (Number.isNaN(t)) return ''
	const s = Math.max(1, Math.floor((Date.now() - t) / 1000))
	if (s < 60) return `${s}s ago`
	const m = Math.floor(s / 60)
	if (m < 60) return `${m}m ago`
	const h = Math.floor(m / 60)
	if (h < 24) return `${h}h ago`
	const d = Math.floor(h / 24)
	if (d < 30) return `${d}d ago`
	return new Date(t).toLocaleDateString('en-CA')
}

/** Parse the `topics` JSON column defensively (it is stored as a JSON string). */
function parseTopics(raw: string | undefined): string[] {
	if (!raw) return []
	try {
		const v = JSON.parse(raw)
		return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
	} catch {
		return []
	}
}

/** First line of a commit message (used for the "latest commit" summary). */
function firstLine(msg: string): string {
	const idx = msg.indexOf('\n')
	return idx === -1 ? msg : msg.slice(0, idx)
}

/** Format a file size in a human-readable way. */
function formatBytes(n: number): string {
	if (!n) return '0 B'
	const units = ['B', 'KB', 'MB', 'GB']
	let i = 0
	let v = n
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024
		i++
	}
	return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

export default createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const ref = c.req.query('ref') || ''
	const path = c.req.query('path') || ''

	// 1) Resolve the repository by its canonical `{owner}/{name}` path.
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

	const defaultBranch = repository.defaultBranch || 'main'
	const activeRef = ref || defaultBranch

	// 2) Fetch the tree (root README included on "/") for the active ref:path.
	let entries: TreeEntry[] = []
	let readme: string | null = null
	let branches: string[] = []
	const treeQs = new URLSearchParams()
	treeQs.set('ref', activeRef)
	if (path && path !== '/') treeQs.set('path', path)
	const tree: any = await apiFetch(c, `/page/repositories/${repository.id}/tree?${treeQs.toString()}`)
	if (tree) {
		entries = tree.entries ?? []
		readme = tree.readme ?? null
		branches = tree.branches ?? []
	}

	// 3) Fetch recent commits for the active ref.
	let commits: Commit[] = []
	const commitsQs = new URLSearchParams()
	commitsQs.set('ref', activeRef)
	const history: any = await apiFetch(c, `/page/repositories/${repository.id}/commits?${commitsQs.toString()}`)
	if (history) commits = history.commits ?? []

	const topics = parseTopics(repository.topics)
	const ownerName = owner?.name ?? userId
	const pathParts = (path || '/').split('/').filter(Boolean)
	const latest = commits[0] ?? null

	// Build a `/src/{ref}/{path}` URL helper that keeps the current ref —
	// matching Forgejo's `/src/branch|tag|commit/{ref}/{path}` addressing. The
	// repo home (this page) serves the tree for the active ref; the catch-all
	// `src/[...path]` route renders trees AND blobs for any ref/path.
	const atPath = (p: string) => {
		const rel = p && p !== '/' ? `/${p}` : ''
		return `/${ownerName}/${repositoryName}/src/${activeRef}${rel}`
	}
	// Root tree link for the active ref (points at the catch-all route).
	const atRefRoot = (ref: string) => `/${ownerName}/${repositoryName}/src/${ref}`

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>{ownerName}/{repository.name} · CodeForge</title>
			<SiteHeader />

			<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 8 })}>
				{/* ---------- Repo header ---------- */}
				<section class={css({ mb: 6 })}>
					<Stack direction="horizontal" align="center" gap="2" wrap>
						<Heading as="h1" class={css({ fontWeight: 800, fontSize: '2xl', letterSpacing: '-0.01em', truncate: true })}>
							<Anchor href={`/${ownerName}`} variant="plain" class={css({ color: 'accent', _hover: { textDecoration: 'underline' } })}>
								{ownerName}
							</Anchor>
							<span class={css({ color: 'faint' })}> / </span>
							<span class={css({ color: 'ink' })}>{repository.name}</span>
						</Heading>
						{repository.isPrivate && (
							<Badge variant="subtle" colorPalette="gray">
								private
							</Badge>
						)}
						{repository.isArchived && (
							<Badge variant="subtle" colorPalette="gray">
								archived
							</Badge>
						)}
						{repository.isMirror && (
							<Badge variant="subtle" colorPalette="blue">
								mirror
							</Badge>
						)}
						{repository.isTemplate && (
							<Badge variant="subtle" colorPalette="purple">
								template
							</Badge>
						)}
					</Stack>

					<Text class={css({ mt: 2, maxWidth: '2xl', fontSize: 'sm', color: 'muted', lineHeight: 1.6 })}>
						{repository.description || 'No description provided.'}
					</Text>

					{topics.length > 0 && (
						<Stack direction="horizontal" align="center" gap="2" wrap class={css({ mt: 3 })}>
							{topics.map((t) => (
								<Badge key={t} variant="outline">
									{t}
								</Badge>
							))}
						</Stack>
					)}

					{/* Action bar: counters + clone */}
					<Stack direction="horizontal" align="center" gap="4" wrap class={css({ mt: 4 })}>
						<Stack direction="horizontal" align="center" gap="1" class={css({ fontSize: 'sm', color: 'muted' })}>
							<span aria-hidden>⭐</span>
							<Text as="span"><strong class={css({ color: 'ink' })}>{repository.numStars}</strong> Stars</Text>
						</Stack>
						<Stack direction="horizontal" align="center" gap="1" class={css({ fontSize: 'sm', color: 'muted' })}>
							<span aria-hidden>⑂</span>
							<Text as="span"><strong class={css({ color: 'ink' })}>{repository.numForks}</strong> Forks</Text>
						</Stack>
						<Stack direction="horizontal" align="center" gap="1" class={css({ fontSize: 'sm', color: 'muted' })}>
							<span aria-hidden>⊘</span>
							<Text as="span"><strong class={css({ color: 'ink' })}>{repository.numOpenIssues}</strong> Issues</Text>
						</Stack>
					</Stack>
				</section>

				{/* ---------- Tabs ---------- */}
				<nav class={css({ display: 'flex', gap: 1, borderBottom: '1px solid token(colors.border)', mb: 6 })}>
					<span class={css({ px: 4, py: 2.5, fontSize: 'sm', fontWeight: 700, color: 'ink', borderBottom: '2px solid token(colors.accent)', mb: -1 })}>
						Code
					</span>
					<Anchor
						href={`/${ownerName}/${repositoryName}/commits?ref=${encodeURIComponent(activeRef)}`}
						variant="plain"
						class={css({ px: 4, py: 2.5, fontSize: 'sm', color: 'muted', _hover: { color: 'ink' } })}
					>
						Commits
					</Anchor>
					<Anchor
						href={`/${ownerName}/${repositoryName}/branches`}
						variant="plain"
						class={css({ px: 4, py: 2.5, fontSize: 'sm', color: 'muted', _hover: { color: 'ink' } })}
					>
						Branches
					</Anchor>
					<Anchor
						href={`/${ownerName}/${repositoryName}/issues`}
						variant="plain"
						class={css({ px: 4, py: 2.5, fontSize: 'sm', color: 'muted', _hover: { color: 'ink' } })}
					>
						Issues
					</Anchor>
					<span class={css({ px: 4, py: 2.5, fontSize: 'sm', color: 'muted' })}>Pull requests</span>
				</nav>

				<div class={css({ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, alignItems: 'start' })}>
					{/* ---- main column: file browser ---- */}
					<div>
						{/* Branch + path bar */}
						<Stack direction="horizontal" align="center" gap="2" wrap class={css({ mb: 4 })}>
							<form method="get" class={css({ display: 'flex', alignItems: 'center', gap: 2 })}>
								<label class={css({ fontSize: 'xs', color: 'faint', textTransform: 'uppercase', letterSpacing: '0.05em' })}>
									Branch
								</label>
								<select
									name="ref"
									defaultValue={activeRef}
									onchange="this.form.submit()"
									class={css({
										rounded: 'md',
										border: '1px solid token(colors.border)',
										bg: 'white',
										px: 2,
										py: 1.5,
										fontSize: 'sm',
										outline: 'none',
										_focus: { borderColor: 'accent' },
									})}
								>
									{(branches.length ? branches : [defaultBranch]).map((b) => (
										<option key={b} value={b}>
											{b}
										</option>
									))}
								</select>
								{path && path !== '/' && <input type="hidden" name="path" value={path} />}
							</form>

							{/* Breadcrumb */}
							<Stack direction="horizontal" align="center" gap="1" class={css({ fontSize: 'sm' })}>
								<Anchor href={atRefRoot(activeRef)} variant="plain" class={css({ color: 'muted', _hover: { color: 'accent' } })}>
									{repository.name}
								</Anchor>
								{pathParts.map((part, i) => {
									const up = pathParts.slice(0, i + 1).join('/')
									const href = atPath(up)
									return (
										<span key={part} class={css({ display: 'flex', alignItems: 'center', gap: 1 })}>
											<span aria-hidden class={css({ color: 'faint' })}>/</span>
											<Anchor href={href} variant="plain" class={css({ color: i === pathParts.length - 1 ? 'ink' : 'muted', fontWeight: i === pathParts.length - 1 ? 600 : 400, _hover: { color: 'accent' } })}>
												{part}
											</Anchor>
										</span>
									)
								})}
							</Stack>
						</Stack>

						{/* File tree */}
						{entries.length > 0 ? (
							<Card class={css({ p: 0, width: 'full', overflow: 'hidden' })}>
								<div class={css({ divideY: '1px solid token(colors.border)' })}>
									{entries.map((e) => {
										const href = atPath([...pathParts, e.name].join('/'))
										return (
											<Anchor
												key={e.name}
												href={href}
												variant="plain"
												class={css({ display: 'flex', alignItems: 'center', gap: 3, px: 4, py: 2.5, _hover: { bg: '#fafafa' }, color: 'ink' })}
											>
												<span aria-hidden class={css({ w: 4, color: e.type === 'tree' ? 'accent' : 'faint', textAlign: 'center' })}>
													{e.type === 'tree' ? '📁' : '📄'}
												</span>
												<Text class={css({ fontSize: 'sm', fontWeight: e.type === 'tree' ? 600 : 400, truncate: true })}>
													{e.name}
												</Text>
											</Anchor>
										)
									})}
								</div>
							</Card>
						) : (
							<Card class={css({ p: 10, width: 'full', textAlign: 'center' })}>
								<Text class={css({ fontSize: 'sm', color: 'muted' })}>
									{path && path !== '/'
										? 'This directory is empty.'
										: 'This repository is empty. Push a commit to get started.'}
								</Text>
							</Card>
						)}

						{/* README */}
						{readme != null && (
							<Card class={css({ mt: 6, width: 'full', overflow: 'hidden' })}>
								<Stack direction="horizontal" align="center" class={css({ px: 4, py: 2.5, borderBottom: '1px solid token(colors.border)', bg: '#fafafa' })}>
									<Text class={css({ fontSize: 'xs', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'faint' })}>
										README
									</Text>
								</Stack>
								<Code class={css({ display: 'block', p: 4, fontSize: 'sm', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' })}>
									{readme}
								</Code>
							</Card>
						)}

						{/* Recent commits */}
						<section class={css({ mt: 8 })}>
							<Heading class={css({ mb: 3, fontSize: 'lg', fontWeight: 700 })}>
								Recent commits
							</Heading>
							{commits.length > 0 ? (
								<Card class={css({ p: 0, width: 'full', overflow: 'hidden' })}>
									<div class={css({ divideY: '1px solid token(colors.border)' })}>
										{commits.map((commit) => (
											<div key={commit.oid} class={css({ px: 4, py: 3 })}>
												<Stack direction="horizontal" justify="between" align="center" gap="3" wrap>
													<Text class={css({ fontSize: 'sm', fontWeight: 600, color: 'ink', lineClamp: 1 })}>
														{firstLine(commit.message)}
													</Text>
													<Text class={css({ fontSize: 'xs', color: 'faint', flexShrink: 0 })}>
														{timeAgo(commit.timestamp)}
													</Text>
												</Stack>
												<Text class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>
													<code class={css({ fontFamily: 'monospace' })}>{commit.oid.slice(0, 7)}</code>
													{' · '}
													{commit.author.name}
												</Text>
											</div>
										))}
									</div>
								</Card>
							) : (
								<Text class={css({ fontSize: 'sm', color: 'faint' })}>No commits yet.</Text>
							)}
						</section>
					</div>

					{/* ---- sidebar ---- */}
					<aside class={css({ spaceY: 6, position: 'sticky', top: '5rem' })}>
						{/* Clone */}
						<Card class={css({ p: 5, width: 'full' })}>
							<Text class={css({ fontSize: 'xs', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'faint', mb: 2 })}>
								Clone
							</Text>
							<Code class={css({ display: 'block', px: 3, py: 2, rounded: 'md', bg: '#f6f8fa', fontSize: 'xs', overflowX: 'auto', whiteSpace: 'nowrap' })}>
								git clone https://host/{ownerName}/{repository.lowerName || repository.name}.git
							</Code>
							{repository.defaultBranch && (
								<Text class={css({ mt: 2, fontSize: 'xs', color: 'faint' })}>
									Default branch: <strong class={css({ color: 'ink' })}>{defaultBranch}</strong> ·{' '}
									{formatBytes(repository.size ?? 0)}
								</Text>
							)}
							<Button as="a" href={`/repositories/${repository.id}`} variant="outline" size="sm" class={css({ mt: 3, width: 'full' })}>
								Manage repository
							</Button>
						</Card>

						{/* Owner */}
						{owner && (
							<Card class={css({ p: 5, width: 'full' })}>
								<Text class={css({ fontSize: 'xs', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'faint', mb: 3 })}>
									Owner
								</Text>
								<Stack direction="horizontal" align="center" gap="3">
									<span
										class={css({
											display: 'inline-flex',
											alignItems: 'center',
											justifyContent: 'center',
											w: 10,
											h: 10,
											rounded: 'full',
											bg: 'accent',
											color: 'white',
											fontSize: 'md',
											fontWeight: 700,
											flexShrink: 0,
										})}
									>
										{ownerName.charAt(0).toUpperCase()}
									</span>
									<div>
										<Anchor href={`/users/${owner.id}`} variant="plain" class={css({ fontWeight: 700, color: 'ink' })}>
											{ownerName}
										</Anchor>
										<Text class={css({ fontSize: 'xs', color: 'faint' })}>Created {timeAgo(repository.created_at)}</Text>
									</div>
								</Stack>
							</Card>
						)}

						<RepositoryDrawer />
					</aside>
				</div>
			</main>
		</div>,
	)
})
