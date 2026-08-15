import { createRoute } from "honox/factory";
import { AuthPage } from "../components/auth-page";
import { getAuthInstance } from "../../src/auth/context";
import {
	authErrorMessage,
	forwardAuthForm,
	safeRedirectTarget,
} from "../../src/auth/proxy";

/**
 * Sign-up page — `/sign-up`.
 *
 * Mirrors `/sign-in` but drives the `signUp.email` flow (the island shows an
 * extra Name field and calls `authClient.signUp.email`). Better Auth's
 * `autoSignIn: true` (see `src/auth/options.ts`) means a successful sign-up
 * also establishes the session, so the same post-login `?next=` redirect
 * applies.
 *
 * Gated by `__BETTER_AUTH_ENABLED__` for the same DCE reasons as `/sign-in`.
 *
 * ## Robustness against broken island hydration
 * The `AuthForm` island submits via Better Auth's client when it hydrates. If
 * it does NOT hydrate (e.g. a Workers build that fails to emit the HonoX
 * `<honox-island>` markers), the `<form>` falls back to a native
 * `method="post"` submit to this route, and the `POST` handler below forwards
 * the submission to Better Auth's real `/api/auth/sign-up/email` endpoint and
 * redirects after copying the session cookie — so sign-up works with zero
 * client JS.
 */
export default createRoute(async (c) => {
	const next = c.req.query("next") ?? "";
	return c.render(<AuthPage mode="sign-up" next={next} />);
});

export const POST = createRoute(async (c) => {
	if (!__BETTER_AUTH_ENABLED__) return c.redirect("/");

	const auth = await getAuthInstance(c);
	if (!auth) return c.redirect("/");

	const form = await c.req.parseBody();
	const email = typeof form.email === "string" ? form.email.trim() : "";
	const password = typeof form.password === "string" ? form.password : "";
	const name = typeof form.name === "string" ? form.name.trim() : "";
	const next = safeRedirectTarget(c.req.query("next"));

	if (!email || !password || !name) {
		return c.render(
			<AuthPage
				mode="sign-up"
				next={next}
				error="Please fill in every field."
				defaultEmail={email}
				defaultName={name}
			/>,
		);
	}

	const { status, setCookie, body } = await forwardAuthForm({
		auth,
		endpoint: "/sign-up/email",
		payload: { email, password, name },
		cookie: c.req.header("cookie") ?? undefined,
		origin: new URL(c.req.url).origin,
	});

	if (status >= 200 && status < 300) {
		const res = c.redirect(next, 302);
		for (const ck of setCookie) res.headers.append("Set-Cookie", ck);
		return res;
	}

	return c.render(
		<AuthPage
			mode="sign-up"
			next={next}
			error={authErrorMessage(body) ?? "Couldn't create your account. Please try again."}
			defaultEmail={email}
			defaultName={name}
		/>,
	);
});
