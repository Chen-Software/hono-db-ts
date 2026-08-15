import { createRoute } from "honox/factory";
import { AuthPage } from "../components/auth-page";
import { getAuthInstance } from "../../src/auth/context";
import {
	authErrorMessage,
	forwardAuthForm,
	safeRedirectTarget,
} from "../../src/auth/proxy";

/**
 * Sign-in page — `/sign-in`.
 *
 * Renders the `AuthForm` island (email + password). Unauthenticated visitors
 * hitting a protected route (e.g. `/users/:id`) are redirected here with a
 * `?next=` param, which we forward to the island so they land back where they
 * were after signing in.
 *
 * When Better Auth is compiled out (`BETTER_AUTH_ENABLED=false`), the island
 * is never rendered (and its `better-auth` dependency is dead-code-eliminated
 * by the Vite `define`), so we show a plain notice instead.
 *
 * ## Robustness against broken island hydration
 * See `sign-up.tsx` for the rationale: if the `AuthForm` island fails to
 * hydrate, the `<form>` does a native `method="post"` submit to this route and
 * the `POST` handler forwards it to Better Auth's `/api/auth/sign-in/email`
 * endpoint, copying the session cookie onto a `?next=` redirect.
 */
export default createRoute(async (c) => {
	const next = c.req.query("next") ?? "";
	return c.render(<AuthPage mode="sign-in" next={next} />);
});

export const POST = createRoute(async (c) => {
	if (!__BETTER_AUTH_ENABLED__) return c.redirect("/");

	const auth = await getAuthInstance(c);
	if (!auth) return c.redirect("/");

	const form = await c.req.parseBody();
	const email = typeof form.email === "string" ? form.email.trim() : "";
	const password = typeof form.password === "string" ? form.password : "";
	const next = safeRedirectTarget(c.req.query("next"));

	if (!email || !password) {
		return c.render(
			<AuthPage
				mode="sign-in"
				next={next}
				error="Please enter your email and password."
				defaultEmail={email}
			/>,
		);
	}

	const { status, setCookie, body } = await forwardAuthForm({
		auth,
		endpoint: "/sign-in/email",
		payload: { email, password },
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
			mode="sign-in"
			next={next}
			error={authErrorMessage(body) ?? "Couldn't sign you in. Please check your details."}
			defaultEmail={email}
		/>,
	);
});
