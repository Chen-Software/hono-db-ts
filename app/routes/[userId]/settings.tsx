import { css } from '../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Button, Card, Heading, Stack, Text } from '../../components/ui'
import { UserSettingsLayout } from '../../components/user-settings-layout'
import { apiFetch } from '../../lib/api'
import { getAuthInstance, getSession } from '../../../src/auth/context'

/**
 * User settings page — `/{owner}/settings`.
 *
 * The forge's account settings (Forgejo's `/user/settings`): change username /
 * email, update password, manage personal access tokens, and a danger zone.
 * Pure SSR, Forgejo-style layout: a left settings nav plus the settings cards.
 *
 * Authentication:
 *   - Gated by `__BETTER_AUTH_ENABLED__` (Vite define, same DCE pattern as
 *     `users/[id]`): with auth compiled out the page stays accessible as a
 *     public read-only demo (tokens are hidden); with auth on, a missing
 *     session redirects to sign-in.
 *   - The `:userId` is the owner's login name; it resolves the profile + tokens
 *     over the JSON API by-name endpoint.
 *
 * POST dispatch uses a hidden `action` field (mirrors Forgejo's `_method`):
 *   - `profile`      → update username/email (service layer), follow rename
 *   - `password`     → forward to Better Auth `/change-password`
 *   - `token`        → create a token; the raw token is shown exactly once
 *   - `token-delete` → delete an access token
 */

type UserRow = {
	id: string
	name: string
	email?: string
	role?: string
	created_at?: string
}

type Token = {
	id: string
	name: string
	scopes: string
	last_used_at: string | null
	expires_at: string | null
	created_at: string
}

/** Format an ISO timestamp as a short relative age ("3h ago"). */
function timeAgo(iso: string | null | undefined): string {
	if (!iso) return 'never'
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
	return new Date(iso).toLocaleDateString('en-CA')
}

export default createRoute(async (c) => {
	const name = c.req.param('userId')
	const flashError = c.req.query('error')
	const flashNotice = c.req.query('notice')

	// Auth gate (DCE-able).
	if (__BETTER_AUTH_ENABLED__) {
		const session = await getSession(c)
		if (!session?.user) {
			return c.redirect(`/sign-in?next=/${encodeURIComponent(name)}/settings`)
		}
	}

	// SSR: fetch the settings payload (profile + tokens) by login name.
	let user: UserRow | null = null
	let tokens: Token[] = []
	const payload: any = await apiFetch(c, `/page/users/by-name/${encodeURIComponent(name)}/settings`)
	if (payload) {
		user = payload.user ?? null
		tokens = payload.tokens ?? []
	}

	// A token that was just created is passed via query so it can be shown once.
	const freshToken =
		typeof c.req.query('token') === 'string' && c.req.query('token') ? (c.req.query('token') as string) : null

	if (!user) {
		c.status(404)
		return c.render(
			<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, sans-serif' })}>
				<title>User not found · CodeForge</title>
				<SiteHeader />
				<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 16, textAlign: 'center' })}>
					<Heading class={css({ fontSize: '2xl', fontWeight: 800 })}>User not found</Heading>
					<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted' })}>
						No member named <code class={css({ color: 'accent' })}>{name}</code>.
					</Text>
					<Anchor href="/" variant="plain" class={css({ mt: 6, display: 'inline-block', fontSize: 'sm', color: 'accent', fontWeight: 600 })}>
						← Back to home
					</Anchor>
				</main>
			</div>,
		)
	}

	const ownerName = user.name
	const settingsHref = `/${ownerName}/settings`

	return c.render(
		<UserSettingsLayout username={ownerName} active="profile">
			<title>Settings · {user.name} · CodeForge</title>

			{/* Flash */}
			{flashNotice && (
				<div class={css({ mb: 6, px: 4, py: 3, rounded: 'md', bg: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: 'sm', fontWeight: 600 })}>
					{flashNotice}
				</div>
			)}
			{flashError && (
				<div class={css({ mb: 6, px: 4, py: 3, rounded: 'md', bg: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: 'sm', fontWeight: 600 })}>
					{flashError}
				</div>
			)}

			{/* ---- main content ---- */}
			<div class={css({ spaceY: 6, minWidth: 0 })}>
						{/* Profile */}
						<Card id="profile" class={css({ p: 6, width: 'full' })}>
							<Heading class={css({ fontSize: 'lg', fontWeight: 800 })}>Profile</Heading>
							<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
								Your public identity. Changing the username renames the
								<code class={css({ mx: 1, color: 'accent' })}>{`/{owner}`}</code> URL.
							</Text>

							<form method="post" action={settingsHref} class={css({ mt: 6, spaceY: 5 })}>
								<input type="hidden" name="action" value="profile" />

								<div>
									<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
										Username
									</label>
									<input
										name="name"
										required
										maxLength={255}
										defaultValue={user.name}
										class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
									/>
									<p class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>
										Lowercase, URL-safe. Used in your profile and repository URLs.
									</p>
								</div>

								<div>
									<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
										Email
									</label>
									<input
										name="email"
										type="email"
										maxLength={255}
										defaultValue={user.email ?? ''}
										class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
									/>
								</div>

								<Stack direction="horizontal" align="center" gap="3" class={css({ pt: 2, borderTop: '1px solid token(colors.border)' })}>
									<Button type="submit" size="md">
										Save profile
									</Button>
									<Text class={css({ fontSize: 'xs', color: 'faint' })}>
										Role: <strong class={css({ color: 'ink', textTransform: 'capitalize' })}>{user.role ?? 'member'}</strong> · Joined {timeAgo(user.created_at)}
									</Text>
								</Stack>
							</form>
						</Card>

						{/* Account / password */}
						<Card id="account" class={css({ p: 6, width: 'full' })}>
							<Heading class={css({ fontSize: 'lg', fontWeight: 800 })}>Password</Heading>
							<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
								Set a new password for your account. You'll need to enter your current password.
							</Text>

							{__BETTER_AUTH_ENABLED__ ? (
								<form method="post" action={settingsHref} class={css({ mt: 6, spaceY: 5 })}>
									<input type="hidden" name="action" value="password" />

									<div>
										<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
											Current password
										</label>
										<input
											name="currentPassword"
											type="password"
											required
											autocomplete="current-password"
											class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
										/>
									</div>

									<div class={css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 })}>
										<div>
											<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
												New password
											</label>
											<input
												name="newPassword"
												type="password"
												required
												minLength={8}
												autocomplete="new-password"
												class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
											/>
										</div>
										<div>
											<label class={css({ display: 'block', mb: 1.5, fontSize: 'xs', fontWeight: 600, color: 'muted' })}>
												Confirm new password
											</label>
											<input
												name="retype"
												type="password"
												required
												minLength={8}
												autocomplete="new-password"
												class={css({ w: 'full', px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
											/>
										</div>
									</div>

									<Button type="submit" size="md">
										Update password
									</Button>
								</form>
							) : (
								<Text class={css({ mt: 4, fontSize: 'sm', color: 'faint' })}>
									Password management is unavailable when authentication is disabled.
								</Text>
							)}
						</Card>

						{/* Access tokens */}
						<Card id="tokens" class={css({ p: 6, width: 'full' })}>
							<Heading class={css({ fontSize: 'lg', fontWeight: 800 })}>Personal access tokens</Heading>
							<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
								Tokens authenticate the git transport (Basic auth). They grant{' '}
								<code class={css({ color: 'accent' })}>read:repository</code> and{' '}
								<code class={css({ color: 'accent' })}>write:repository</code>. A token is shown only once when created.
							</Text>

							{/* Freshly-created token (shown exactly once) */}
							{freshToken && (
								<div class={css({ mt: 5, p: 4, rounded: 'md', bg: '#fffbeb', border: '1px solid #fde68a' })}>
									<Text class={css({ fontSize: 'sm', fontWeight: 700, color: '#92400e' })}>Your new token</Text>
									<Text class={css({ mt: 1, fontSize: 'xs', color: '#b45309' })}>
										Copy it now — you won't see it again. Use it as the password when cloning over HTTP.
									</Text>
									<code class={css({ display: 'block', mt: 3, px: 3, py: 2, rounded: 'md', bg: 'white', border: '1px solid #fcd34d', fontSize: 'sm', fontFamily: 'monospace', wordBreak: 'break-all' })}>
										{freshToken}
									</code>
								</div>
							)}

							{/* Create form */}
							<form method="post" action={settingsHref} class={css({ mt: 6, display: 'flex', alignItems: 'center', gap: 3 })}>
								<input type="hidden" name="action" value="token" />
								<input
									name="name"
									required
									maxLength={120}
									placeholder="e.g. my-laptop"
									class={css({ flex: 1, px: 3, py: 2, rounded: 'md', border: '1px solid token(colors.border)', bg: 'white', fontSize: 'sm', outline: 'none', _focus: { borderColor: 'accent' } })}
								/>
								<Button type="submit" size="md">
									Generate token
								</Button>
							</form>

							{/* Token list */}
							{tokens.length > 0 ? (
								<div class={css({ mt: 6, rounded: 'lg', border: '1px solid token(colors.border)', overflow: 'hidden' })}>
									<div class={css({ divideY: '1px solid token(colors.border)' })}>
										{tokens.map((t) => (
											<div key={t.id} class={css({ px: 4, py: 3, display: 'flex', alignItems: 'center', justify: 'space-between', gap: 3 })}>
												<div>
													<Text class={css({ fontSize: 'sm', fontWeight: 600, color: 'ink' })}>{t.name}</Text>
													<Text class={css({ mt: 0.5, fontSize: 'xs', color: 'faint' })}>
														Created {timeAgo(t.created_at)} · Last used {timeAgo(t.last_used_at)} ·{' '}
														{t.expires_at ? `Expires ${timeAgo(t.expires_at)}` : 'No expiry'}
													</Text>
												</div>
												<form method="post" action={settingsHref} class={css({ display: 'inline' })}>
													<input type="hidden" name="action" value="token-delete" />
													<input type="hidden" name="id" value={t.id} />
													<Button type="submit" variant="outline" size="sm" class={css({ borderColor: '#fecaca', color: '#b91c1c' })}>
														Delete
													</Button>
												</form>
											</div>
										))}
									</div>
								</div>
							) : (
								<Text class={css({ mt: 6, fontSize: 'sm', color: 'faint' })}>
									No access tokens yet.
								</Text>
							)}
						</Card>

						{/* Danger zone */}
						<Card id="danger" class={css({ p: 6, width: 'full', border: '1px solid #fecaca' })}>
							<Heading class={css({ fontSize: 'lg', fontWeight: 800, color: '#b91c1c' })}>Danger zone</Heading>
							<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
								Irreversible actions on your account.
							</Text>
							<Stack direction="horizontal" justify="between" align="center" class={css({ mt: 4, pt: 4, borderTop: '1px solid #fee2e2' })}>
								<div>
									<Text class={css({ fontSize: 'sm', fontWeight: 600, color: 'ink' })}>Delete your account</Text>
									<Text class={css({ fontSize: 'xs', color: 'muted' })}>Permanently delete your account and all owned repositories.</Text>
								</div>
								<Button variant="outline" size="sm" disabled class={css({ borderColor: '#fecaca', color: '#b91c1c', opacity: 0.6 })}>
									Delete account
								</Button>
							</Stack>
						</Card>
					</div>
		</UserSettingsLayout>,
	)
})

/**
 * POST /{owner}/settings — dispatch settings actions by the hidden `action`
 * field (Forgejo's `_method` equivalent). All handlers are SSR-only.
 */
export const POST = createRoute(async (c) => {
	const name = c.req.param('userId')
	const form = await c.req.parseBody()
	const action = typeof form.action === 'string' ? form.action : ''

	// Profile update → service layer, follow a rename via redirect.
	if (action === 'profile') {
		const body = new URLSearchParams()
		body.set('action', 'profile')
		if (typeof form.name === 'string') body.set('name', form.name)
		if (typeof form.email === 'string') body.set('email', form.email)
		return apiPostFormRaw(c, `/page/users/by-name/${encodeURIComponent(name)}/settings`, body.toString())
	}

	// Token delete → service layer, then redirect back to settings.
	if (action === 'token-delete') {
		const body = new URLSearchParams()
		if (typeof form.id === 'string') body.set('id', form.id)
		await postJson(c, `/page/users/by-name/${encodeURIComponent(name)}/settings/tokens/delete`, body.toString())
		return c.redirect(`/${name}/settings?notice=${encodeURIComponent('Token deleted.')}`)
	}

	// Create token → returns the raw token; redirect showing it once.
	if (action === 'token') {
		const tokenName = typeof form.name === 'string' ? form.name.trim() : ''
		if (!tokenName) return c.redirect(`/${name}/settings#tokens`)
		const body = new URLSearchParams()
		body.set('name', tokenName)
		const data = await postJson(c, `/page/users/by-name/${encodeURIComponent(name)}/settings/tokens`, body.toString())
		if (data && typeof data.token === 'string') {
			return c.redirect(`/${name}/settings?token=${encodeURIComponent(data.token)}#tokens`)
		}
		return c.redirect(`/${name}/settings?error=${encodeURIComponent('Could not create the token.')}#tokens`)
	}

	// Password change → forward to Better Auth's `/change-password` endpoint.
	if (action === 'password') {
		if (!__BETTER_AUTH_ENABLED__) return c.redirect(`/${name}/settings`)
		const auth = await getAuthInstance(c)
		if (!auth) return c.redirect(`/${name}/settings`)
		const currentPassword = typeof form.currentPassword === 'string' ? form.currentPassword : ''
		const newPassword = typeof form.newPassword === 'string' ? form.newPassword : ''
		const retype = typeof form.retype === 'string' ? form.retype : ''
		if (newPassword !== retype) {
			return c.redirect(`/${name}/settings?error=${encodeURIComponent('The new passwords do not match.')}#account`)
		}
		// Better Auth's change-password route: POST /api/auth/change-password
		// with `{ currentPassword, newPassword }` (JSON). We rebuild the request
		// aimed at the auth endpoint and forward the session cookie.
		const url = new URL(c.req.url)
		url.pathname = '/api/auth/change-password'
		const baRes = await auth.handler(
			new Request(url, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					cookie: c.req.header('cookie') ?? '',
				},
				body: JSON.stringify({ currentPassword, newPassword }),
			}),
		)
		if (baRes.status >= 200 && baRes.status < 300) {
			return c.redirect(`/${name}/settings?notice=${encodeURIComponent('Password updated.')}#account`)
		}
		let msg = ''
		try {
			msg = (await baRes.json())?.message ?? ''
		} catch {
			/* ignore parse errors */
		}
		return c.redirect(`/${name}/settings?error=${encodeURIComponent(msg || 'Could not update the password.')}#account`)
	}

	// Unknown action → back to settings.
	return c.redirect(`/${name}/settings`)
})

/** Forward a form POST to a `/page/*` mutation and return its JSON `data`. */
async function postJson(c: Parameters<typeof apiFetch>[0], path: string, body: string): Promise<Record<string, unknown> | null> {
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
		const text = await res.text()
		if (!text) return null
		return JSON.parse(text)?.data ?? null
	} catch (err) {
		console.error('[postJson]', err)
		return null
	}
}

/** Forward a form POST and return the API's response (a redirect we stream). */
async function apiPostFormRaw(c: Parameters<typeof apiFetch>[0], path: string, body: string): Promise<Response> {
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
	if (res.status >= 300 && res.status < 400 && res.headers.has('location')) return res
	return c.redirect(c.req.url)
}
