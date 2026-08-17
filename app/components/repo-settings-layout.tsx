import { css } from '../../design-system/css'
import { Anchor, Heading, Text } from './ui'
import { RepoPageLayout } from './repo-layout'

/**
 * Shared repository-settings layout (Forgejo-aligned).
 *
 * Mirrors Forgejo's `repo/settings/layout_head.tmpl` + `navbar.tmpl`: the repo
 * header + tab bar (from `RepoPageLayout`) plus a left "Settings" submenu
 * (General / Units / Branches / Tags / Collaborators / Hooks) with the active
 * item highlighted, and the settings content in the main column. Each sub-page
 * (General today; Branches/Tags arrive in later phases) drops its cards into
 * the `children` slot.
 */

export type RepoSettingsSection = 'general' | 'branches' | 'tags' | 'collaborators' | 'units' | 'hooks'

export function RepoSettingsLayout({
	ownerName,
	repositoryName,
	repository,
	active,
	children,
}: {
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
	active: RepoSettingsSection
	children: JSX.Element
}) {
	const base = `/${ownerName}/${repositoryName}/settings`
	const items: { key: RepoSettingsSection; label: string; href?: string }[] = [
		{ key: 'general', label: 'General', href: base },
		{ key: 'units', label: 'Units' },
		{ key: 'branches', label: 'Branches', href: `${base}/branches` },
		{ key: 'tags', label: 'Tags', href: `${base}/tags` },
		{ key: 'collaborators', label: 'Collaborators', href: `${base}/collaborators` },
		{ key: 'hooks', label: 'Webhooks', href: `${base}/hooks` },
	]

	// Forgejo's "Settings" left menu, rendered inside the repo sub-page shell.
	const settingsMenu = (
		<nav class={css({ position: 'sticky', top: '5rem', display: 'flex', flexDirection: 'column', gap: 1 })}>
			<Text class={css({ px: 3, py: 1, fontSize: 'xs', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'faint' })}>
				Settings
			</Text>
			{items.map((item) =>
				item.href && item.key !== active ? (
					<Anchor
						key={item.key}
						href={item.href}
						variant="plain"
						class={css({ px: 3, py: 2, rounded: 'md', fontSize: 'sm', color: 'muted', fontWeight: 500, _hover: { bg: '#ececee', color: 'ink' } })}
					>
						{item.label}
					</Anchor>
				) : item.href ? (
					<span
						key={item.key}
						class={css({ px: 3, py: 2, rounded: 'md', fontSize: 'sm', fontWeight: 700, color: 'ink', bg: '#ececee' })}
					>
						{item.label}
					</span>
				) : (
					<span key={item.key} class={css({ px: 3, py: 2, rounded: 'md', fontSize: 'sm', color: 'faint', cursor: 'not-allowed' })}>
						{item.label}
						<Text as="span" class={css({ ml: 1, fontSize: 'xs', color: 'faint' })}>(soon)</Text>
					</span>
				),
			)}
		</nav>
	)

	return (
		<RepoPageLayout
			ownerName={ownerName}
			repositoryName={repositoryName}
			repository={repository}
			active="settings"
			children={
				<div class={css({ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 8, alignItems: 'start' })}>
					{settingsMenu}
					<div class={css({ spaceY: 6, minWidth: 0 })}>{children}</div>
				</div>
			}
		/>
	)
}
