import { css } from '../../../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Badge, Button, Card, Heading, Stack, Text } from '../../../../components/ui'
import { RepoPageLayout } from '../../../../components/repo-layout'
import { SiteHeader } from '../../../../components/site-header'
import { apiFetch } from '../../../../lib/api'

/**
 * File / tree browser — `/{owner}/{repo}/src/{ref}/{path...}`.
 *
 * Mirrors Forgejo's `/src/branch/{branch}/{path}` / `/src/commit/{sha}/{path}`
 * addressing (routers/web/web.go:1809 + repo.Home/view.go:812): a single route
 * where the FIRST path segment is the ref (a branch, tag, or commit sha) and
 * the rest is the tree path. The same handler renders either:
 *
 *   - a FILE (blob view) when the path resolves to a blob, or
 *   - a DIRECTORY (tree list) when it resolves to a directory,
 *
 * exactly like Forgejo's `Home` → `GetTreeEntryByPath` + `entry.IsDir()`.
 *
 * Pure SSR. `?path=` is not used here — the ref lives in the URL path, so a file
 * is always pinned to a specific ref (unlike the old query-param approach).
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

type TreeEntry = { name: string; type: 'blob' | 'tree'; oid: string; mode: string }

/** Guess a short language badge label from the file extension. */
function languageLabel(path: string): string {
	const ext = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : ''
	const map: Record<string, string> = {
		ts: 'TypeScript',
		tsx: 'TSX',
		js: 'JavaScript',
		jsx: 'JSX',
		py: 'Python',
		go: 'Go',
		rs: 'Rust',
		rb: 'Ruby',
		java: 'Java',
		kt: 'Kotlin',
		c: 'C',
		h: 'C',
		cpp: 'C++',
		hpp: 'C++',
		cs: 'C#',
		php: 'PHP',
		sh: 'Shell',
		bash: 'Shell',
		zsh: 'Shell',
		html: 'HTML',
		css: 'CSS',
		scss: 'SCSS',
		json: 'JSON',
		yaml: 'YAML',
		yml: 'YAML',
		toml: 'TOML',
		md: 'Markdown',
		txt: 'Text',
		sql: 'SQL',
		xml: 'XML',
		svg: 'SVG',
	}
	const base = path.split('/').pop() ?? ''
	if (base.toLowerCase() === 'dockerfile') return 'Dockerfile'
	if (base.toLowerCase() === 'makefile') return 'Makefile'
	return map[ext] ?? 'Text'
}

export default createRoute(async (c) => {
	const userId = c.req.param('userId')
	const repositoryName = c.req.param('repositoryName')
	const segments = c.req.param('path')?.split('/').filter(Boolean) ?? []

	// First segment is the ref (branch/tag/commit sha); the rest is the path.
	const [refSeg, ...pathParts] = segments
	const activeRef = refSeg || ''
	const path = pathParts.join('/')
	const isRoot = activeRef === '' && pathParts.length === 0

	// Resolve the repository by its canonical path.
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

	// With no `/src/{ref}` segment (bare `/{owner}/{repo}`), default to the repo
	// home; the repo home route (`[repositoryName].tsx`) already renders the
	// default-branch tree, so redirect there to avoid duplication.
	if (isRoot) {
		return c.redirect(`/${ownerName}/${repositoryName}`)
	}

	// If no ref was given but a path was, treat the first part as the ref.
	const ref = activeRef

	// Decide tree-vs-blob: try to read the file; on 404, fall back to the tree.
	// (Mirrors Forgejo's Home: GetTreeEntryByPath then entry.IsDir().)
	const readQs = new URLSearchParams()
	readQs.set('ref', ref)
	if (path) readQs.set('path', path)
	const file: any = await apiFetch(c, `/page/repositories/${repository.id}/read?${readQs.toString()}`)

	const pathSegs = path ? path.split('/').filter(Boolean) : []
	const fileName = pathSegs[pathSegs.length - 1] ?? ''

	// ---- BLOB view: the read succeeded, so the path is a file ----
	if (file?.content != null) {
		const text = file.encoding === 'utf8' ? (file.content as string) : null
		const lineCount = text ? text.split('\n').length : 0

		const crumbParts = [
			{
				label: repository.name,
				href: `/${ownerName}/${repositoryName}/src/${encodeURIComponent(ref)}`,
			},
			...pathSegs.slice(0, -1).map((part, i) => {
				const dirPath = pathSegs.slice(0, i + 1).join('/')
				return {
					label: part,
					href: `/${ownerName}/${repositoryName}/src/${encodeURIComponent(ref)}/${dirPath}`,
				}
			}),
			{ label: fileName },
		]

		const rawHref = `/${ownerName}/${repositoryName}/raw/${encodeURIComponent(ref)}/${path}`

		return c.render(
			<RepoPageLayout
				ownerName={ownerName}
				repositoryName={repositoryName}
				repository={repository}
				active="code"
				breadcrumb={{
					branches: undefined,
					activeRef: ref,
					defaultBranch,
					parts: crumbParts,
					actions: [
						<Anchor key="raw" href={rawHref} target="_blank" rel="noreferrer" variant="plain" class={css({ fontSize: 'sm', color: 'muted', _hover: { color: 'accent' } })}>
							Raw
						</Anchor>,
					],
				}}
				children={
					<div class={css({ spaceY: 6 })}>
						<Card class={css({ p: 0, width: 'full', overflow: 'hidden' })}>
							<Stack direction="horizontal" align="center" justify="between" gap="3" class={css({ px: 4, py: 2.5, borderBottom: '1px solid token(colors.border)', bg: '#fafafa' })}>
								<Stack direction="horizontal" align="center" gap="2">
									<span aria-hidden class={css({ fontSize: 'sm' })}>📄</span>
									<Text class={css({ fontSize: 'sm', fontWeight: 600, color: 'ink', truncate: true })}>{fileName}</Text>
									<Badge variant="subtle" colorPalette="gray" class={css({ fontSize: 'xs' })}>
										{languageLabel(fileName)}
									</Badge>
								</Stack>
								{text != null && <Text class={css({ fontSize: 'xs', color: 'faint' })}>{lineCount.toLocaleString()} lines</Text>}
							</Stack>

							{text != null ? (
								<pre class={css({ p: 4, fontSize: 'sm', lineHeight: 1.7, overflowX: 'auto', whiteSpace: 'pre', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' })}>
									{text}
								</pre>
							) : (
								<div class={css({ p: 12, textAlign: 'center' })}>
									<Text class={css({ fontSize: 'sm', color: 'muted' })}>
										This is a binary file.{' '}
										<Anchor href={rawHref} variant="plain" class={css({ color: 'accent' })}>
											Download raw
										</Anchor>
									</Text>
								</div>
							)}
						</Card>

						<Text class={css({ fontSize: 'xs', color: 'faint' })}>
							Viewing <code class={css({ color: 'accent' })}>{ref}</code> ·{' '}
							<Anchor
								href={`/${ownerName}/${repositoryName}/src/${encodeURIComponent(ref)}`}
								variant="plain"
								class={css({ color: 'muted', _hover: { color: 'accent' } })}
							>
								back to the file tree
							</Anchor>
						</Text>
					</div>
				}
			/>,
		)
	}

	// ---- TREE view: the path is a directory (or the root of `ref`) ----
	const treeQs = new URLSearchParams()
	treeQs.set('ref', ref)
	if (path) treeQs.set('path', path)
	const tree: any = await apiFetch(c, `/page/repositories/${repository.id}/tree?${treeQs.toString()}`)
	const entries: TreeEntry[] = tree?.entries ?? []
	const branches: string[] = tree?.branches ?? []
	const readme = tree?.readme ?? null

	if (!tree) {
		c.status(404)
		return c.render(
			<RepoPageLayout
				ownerName={ownerName}
				repositoryName={repositoryName}
				repository={repository}
				active="code"
				breadcrumb={{ branches, activeRef: ref, defaultBranch, parts: [{ label: ref }, ...pathSegs.map((s) => ({ label: s }))] }}
				children={
					<div class={css({ py: 16, textAlign: 'center' })}>
						<Heading class={css({ fontSize: 'xl', fontWeight: 800 })}>Not found</Heading>
						<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
							<code class={css({ color: 'accent' })}>{ref}</code>
							{path ? ` / ${path}` : ''} does not exist in this repository.
						</Text>
					</div>
				}
			/>,
		)
	}

	const rootHref = `/${ownerName}/${repositoryName}/src/${encodeURIComponent(ref)}`
	const crumbParts = [
		{ label: repository.name, href: rootHref },
		...pathSegs.map((part, i) => {
			const dirPath = pathSegs.slice(0, i + 1).join('/')
			const isLast = i === pathSegs.length - 1
			return isLast
				? { label: part }
				: { label: part, href: `/${ownerName}/${repositoryName}/src/${encodeURIComponent(ref)}/${dirPath}` }
		}),
	]

	return c.render(
		<RepoPageLayout
			ownerName={ownerName}
			repositoryName={repositoryName}
			repository={repository}
			active="code"
			breadcrumb={{ branches, activeRef: ref, defaultBranch, parts: crumbParts }}
			children={
				<div class={css({ spaceY: 6 })}>
					{/* Directory listing */}
					{entries.length > 0 ? (
						<Card class={css({ p: 0, width: 'full', overflow: 'hidden' })}>
							<div class={css({ divideY: '1px solid token(colors.border)' })}>
								{entries.map((e) => {
									const href = `/${ownerName}/${repositoryName}/src/${encodeURIComponent(ref)}${path ? `/${path}` : ''}/${e.name}`
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
								{path ? 'This directory is empty.' : 'This repository is empty. Push a commit to get started.'}
							</Text>
						</Card>
					)}

					{/* Root README */}
					{readme != null && (
						<Card class={css({ mt: 2, width: 'full', overflow: 'hidden' })}>
							<Stack direction="horizontal" align="center" class={css({ px: 4, py: 2.5, borderBottom: '1px solid token(colors.border)', bg: '#fafafa' })}>
								<Text class={css({ fontSize: 'xs', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'faint' })}>
									README
								</Text>
							</Stack>
							<pre class={css({ p: 4, fontSize: 'sm', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' })}>
								{readme}
							</pre>
						</Card>
					)}
				</div>
			}
		/>,
	)
})
