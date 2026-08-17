import { css } from '../../design-system/css'
import { Anchor, Heading, Text } from './ui'
import { SiteHeader } from './site-header'

/**
 * Shared user-settings layout (Forgejo-aligned).
 *
 * Mirrors Forgejo's `templates/user/settings/layout_head.tmpl` + `navbar.tmpl`:
 * a left "Settings" submenu (Profile / Account / Applications / Danger zone)
 * with the active item highlighted, and the settings content in the main
 * column. The submenu routes are:
 *
 *   /user/settings            → profile (username/email)
 *   /user/settings/account    → password + emails + delete account
 *   /user/settings/applications → personal access tokens
 *   /user/settings/security   → (placeholder)
 *
 * `/[owner]/settings` reuses the same layout so both addressing schemes share
 * one consistent shell.
 */

export type UserSettingsSection = 'profile' | 'account' | 'applications' | 'security'

export function UserSettingsLayout({
	username,
	active,
	children,
}: {
	/** The current owner's login name (used for the profile link). */
	username: string
	active: UserSettingsSection
	children: JSX.Element
}) {
	const items: { key: UserSettingsSection; label: string; href?: string }[] = [
		{ key: 'profile', label: 'Profile', href: '/user/settings' },
		{ key: 'account', label: 'Account', href: '/user/settings/account' },
		{ key: 'applications', label: 'Applications', href: '/user/settings/applications' },
		{ key: 'security', label: 'Security', href: '/user/settings/security' },
	]
	return (
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<SiteHeader />
			<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 10 })}>
				{/* Breadcrumb */}
				<div class={css({ display: 'flex', alignItems: 'center', gap: 2, fontSize: 'sm', color: 'muted', mb: 8 })}>
					<Anchor href="/" variant="plain" class={css({ color: 'muted' })}>
						Home
					</Anchor>
					<span aria-hidden>›</span>
					<Anchor href={`/${username}`} variant="plain" class={css({ color: 'muted' })}>
						{username}
					</Anchor>
					<span aria-hidden>›</span>
					<Text class={css({ color: 'ink', fontWeight: 500 })}>Settings</Text>
				</div>

				{/* Page title */}
				<Heading class={css({ mb: 6, fontSize: '2xl', fontWeight: 800 })}>Account settings</Heading>

				<div class={css({ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 8, alignItems: 'start' })}>
					{/* ---- left settings nav (Forgejo's settings submenu) ---- */}
					<nav class={css({ position: 'sticky', top: '5rem', display: 'flex', flexDirection: 'column', gap: 1 })}>
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
							) : (
								<span
									key={item.key}
									class={css({ px: 3, py: 2, rounded: 'md', fontSize: 'sm', fontWeight: 700, color: 'ink', bg: '#ececee' })}
								>
									{item.label}
								</span>
							),
						)}
					</nav>

					{/* ---- main content ---- */}
					<div class={css({ spaceY: 6, minWidth: 0 })}>{children}</div>
				</div>
			</main>
		</div>
	)
}
