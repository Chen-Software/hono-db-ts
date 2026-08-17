import { css } from '../../design-system/css'
import { Anchor, Badge, Heading, Stack, Text } from './ui'
import { SiteHeader } from './site-header'

/**
 * Shared repository sub-page layout (Forgejo-style).
 *
 * Renders the repo header (owner/name + badges + description), the tab bar
 * (Code / Commits / Releases / Settings, with an `active` tab) and — when
 * provided — a branch + path breadcrumb bar. Sub-pages (blob, commit, compare,
 * commits, releases, settings) drop their own `<main>` content into `children`
 * beneath this shared shell.
 */

export type RepoPageProps = {
	ownerName: string
	repositoryName: string
	repository: {
		name: string
		lowerName: string
		description: string
		isPrivate: boolean
		isArchived: boolean
		isMirror: boolean
		isTemplate: boolean
		numStars: number
		numForks: number
		numOpenIssues: number
		numClosedIssues: number
	}
	active: 'code' | 'commits' | 'branches' | 'issues' | 'releases' | 'settings'
	/** Optional branch-select + path breadcrumb bar rendered under the tabs. */
	breadcrumb?: {
		/** Branch names to show in the dropdown (defaults to the active ref). */
		branches?: string[]
		activeRef: string
		defaultBranch: string
		/** Breadcrumb segments; the first is the repo root, the rest are parts. */
		parts: { label: string; href?: string }[]
		/** Extra actions rendered on the right of the breadcrumb bar. */
		actions?: JSX.Element[]
	}
	children: JSX.Element
}

/** The repo tab bar shared by every sub-page. */
function Tabs({
	ownerName,
	repositoryName,
	active,
}: {
	ownerName: string
	repositoryName: string
	active: RepoPageProps['active']
}) {
	const items: { key: RepoPageProps['active']; label: string; href?: string }[] = [
		{ key: 'code', label: 'Code', href: `/${ownerName}/${repositoryName}` },
		{ key: 'commits', label: 'Commits', href: `/${ownerName}/${repositoryName}/commits` },
		{ key: 'branches', label: 'Branches', href: `/${ownerName}/${repositoryName}/branches` },
		{ key: 'releases', label: 'Releases', href: `/${ownerName}/${repositoryName}/releases` },
		{ key: 'settings', label: 'Settings', href: `/${ownerName}/${repositoryName}/settings` },
	]
	return (
		<nav class={css({ display: 'flex', gap: 1, borderBottom: '1px solid token(colors.border)', mb: 6 })}>
			{items.map((t) =>
				t.href && t.key !== active ? (
					<Anchor
						key={t.key}
						href={t.href}
						variant="plain"
						class={css({
							px: 4,
							py: 2.5,
							fontSize: 'sm',
							color: 'muted',
							_hover: { color: 'ink' },
						})}
					>
						{t.label}
					</Anchor>
				) : (
					<span
						key={t.key}
						class={css({ px: 4, py: 2.5, fontSize: 'sm', fontWeight: 700, color: 'ink', borderBottom: '2px solid token(colors.accent)', mb: -1 })}
					>
						{t.label}
					</span>
				),
			)}
		</nav>
	)
}

/** The optional branch dropdown + path breadcrumb bar. */
function BreadcrumbBar({
	ownerName,
	repositoryName,
	crumb,
}: {
	ownerName: string
	repositoryName: string
	crumb: NonNullable<RepoPageProps['breadcrumb']>
}) {
	const { branches, activeRef, defaultBranch, parts, actions } = crumb
	const names = branches && branches.length > 0 ? branches : [defaultBranch]
	return (
		<Stack direction="horizontal" align="center" gap="2" wrap class={css({ mb: 4 })}>
			<form method="get" action={`/${ownerName}/${repositoryName}/src`} class={css({ display: 'flex', alignItems: 'center', gap: 2 })}>
				<label class={css({ fontSize: 'xs', color: 'faint', textTransform: 'uppercase', letterSpacing: '0.05em' })}>
					Branch
				</label>
				<input type="hidden" name="ref" value={activeRef} />
				<input
					name="path"
					value={parts.slice(1).map((p) => p.label).join('/')}
					readOnly
					hidden
				/>
				<span class={css({
					rounded: 'md',
					border: '1px solid token(colors.border)',
					bg: 'white',
					px: 2,
					py: 1.5,
					fontSize: 'sm',
					fontWeight: 600,
					color: 'ink',
				})}>
					{activeRef}
				</span>
			</form>

			<Stack direction="horizontal" align="center" gap="1" class={css({ fontSize: 'sm', flex: 1, minWidth: 0 })}>
				{parts.map((part, i) => (
					<span key={`${part.label}-${i}`} class={css({ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 })}>
						{i > 0 && <span aria-hidden class={css({ color: 'faint' })}>/</span>}
						{part.href ? (
							<Anchor
								href={part.href}
								variant="plain"
								class={css({
									color: i === parts.length - 1 ? 'ink' : 'muted',
									fontWeight: i === parts.length - 1 ? 600 : 400,
									truncate: true,
									_hover: { color: 'accent' },
								})}
							>
								{part.label}
							</Anchor>
						) : (
							<span class={css({ color: 'ink', fontWeight: 600, truncate: true })}>{part.label}</span>
						)}
					</span>
				))}
			</Stack>

			{actions && actions.length ? (
				<Stack direction="horizontal" align="center" gap="2">
					{actions}
				</Stack>
			) : null}
		</Stack>
	)
}

export function RepoPageLayout(props: RepoPageProps) {
	const { ownerName, repositoryName, repository, active, breadcrumb, children } = props
	return (
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
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

					<Stack direction="horizontal" align="center" gap="4" wrap class={css({ mt: 3, fontSize: 'sm', color: 'muted' })}>
						<Text as="span">
							<strong class={css({ color: 'ink' })}>{repository.numStars}</strong> Stars
						</Text>
						<Text as="span">
							<strong class={css({ color: 'ink' })}>{repository.numForks}</strong> Forks
						</Text>
						<Text as="span">
							<strong class={css({ color: 'ink' })}>{repository.numOpenIssues}</strong> Issues
						</Text>
					</Stack>
				</section>

				{/* ---------- Tabs ---------- */}
				<Tabs ownerName={ownerName} repositoryName={repositoryName} active={active} />

				{/* ---------- Breadcrumb / ref bar ---------- */}
				{breadcrumb && <BreadcrumbBar ownerName={ownerName} repositoryName={repositoryName} crumb={breadcrumb} />}

				{/* ---------- Page content ---------- */}
				{children}
			</main>
		</div>
	)
}
