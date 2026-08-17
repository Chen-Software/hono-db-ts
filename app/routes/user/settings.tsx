import { createRoute } from 'honox/factory'
import { getSession } from '../../../src/auth/context'

/**
 * `/user/settings` — the forge's canonical account-settings entry point,
 * mirroring Forgejo's `/user/settings` (routers/web/web.go:738).
 *
 * The settings UI itself lives at `/{owner}/settings` (keyed by login name, so
 * every sub-form can address the owner and follow renames). This static route
 * resolves the *current session user* and redirects there, exactly like
 * `/users/me` redirects to `/users/[id]`:
 *
 *   /user/settings ──session──▶ /{owner}/settings
 *
 * With auth compiled out there is no session, so it sends the visitor home.
 */

export default createRoute(async (c) => {
	if (__BETTER_AUTH_ENABLED__) {
		const session = await getSession(c)
		if (!session?.user) {
			return c.redirect('/sign-in?next=/user/settings')
		}
		// Better Auth users carry a `name` (login); the settings page resolves
		// the profile by that name.
		const name = session.user.name ?? ''
		if (name) return c.redirect(`/${encodeURIComponent(name)}/settings`)
		return c.redirect('/')
	}
	// Auth compiled out: there is no account to configure.
	return c.redirect('/')
})
