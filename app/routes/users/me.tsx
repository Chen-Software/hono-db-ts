import { createRoute } from 'honox/factory'
import { getSession } from '../../../src/auth/context'

/**
 * `/users/me` — a stable, self-referential profile entry point.
 *
 * The real profile route `/users/[id]` is owner-only and requires the caller's
 * exact Better Auth UUID, which is not human-memorable. This route resolves the
 * current session and redirects to `/users/<your-id>`, so the profile is
 * reachable without knowing the id. Unauthenticated visitors are sent to
 * sign-in (with `next` so they return here after logging in).
 *
 * Static `/users/me` is matched by Hono before the dynamic `/users/[id]`, so
 * there is no clash.
 */

export default createRoute(async (c) => {
	if (__BETTER_AUTH_ENABLED__) {
		const session = await getSession(c)
		if (!session?.user) {
			return c.redirect('/sign-in?next=/users/me')
		}
		return c.redirect(`/users/${session.user.id}`)
	}
	// Auth compiled out: there is no "me" — send home.
	return c.redirect('/')
})
