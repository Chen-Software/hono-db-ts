import { SiteHeader } from "../components/site-header";
import { css } from "../../design-system/css";
import { createRoute } from "honox/factory";
import { Card, Heading, Stack, Text } from "../components/ui";
import AuthForm from "../islands/auth-form";

const FONT =
	"ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

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
 */
export default createRoute(async (c) => {
	const next = c.req.query("next") ?? "";

	return c.render(
		<div class={css({ minHeight: "100vh", bg: "#f7f7f8", color: "ink", fontFamily: FONT })}>
			<title>Sign up · BBS</title>

			<SiteHeader variant="app" />
			<main class={css({ maxWidth: "md", mx: "auto", px: 6, py: 16 })}>
				<Card>
					<div class={css({ p: 8 })}>
						<Stack gap="1" class={css({ mb: 6 })}>
							<Heading class={css({ fontSize: "2xl", fontWeight: 800 })}>
								Create your account
							</Heading>
							<Text class={css({ fontSize: "sm", color: "muted" })}>
								Sign up to join the discussion.
							</Text>
						</Stack>

						{__BETTER_AUTH_ENABLED__ ? (
							<AuthForm mode="sign-up" next={next} />
						) : (
							<Text class={css({ fontSize: "sm", color: "muted" })}>
								Authentication is currently disabled on this deployment.
							</Text>
						)}
					</div>
				</Card>
			</main>
		</div>,
	);
});
