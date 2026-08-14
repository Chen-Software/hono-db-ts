import { css } from "../../design-system/css";
import { createRoute } from "honox/factory";
import { Anchor, Card, Heading, Stack, Text } from "../components/ui";
import { Header as LayoutHeader } from "../components/ui/layout";
import AuthForm from "../islands/auth-form";
import ThemeSwitcher from "../islands/theme-switcher";

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

			<LayoutHeader sticky>
				<Stack direction="horizontal" align="center" gap="6" class={css({ flex: 1 })}>
					<Anchor
						href="/"
						variant="plain"
						class={css({ fontSize: "lg", fontWeight: 800, color: "ink" })}
					>
						<span class={css({ display: "inline-block", w: 3, h: 3, rounded: "sm", bg: "accent" })} />
						BBS Forum
					</Anchor>
					<Stack direction="horizontal" align="center" gap="3" class={css({ ml: "auto" })}>
						<ThemeSwitcher />
						<Anchor
							href="/sign-in"
							class={css({ fontSize: "sm", fontWeight: 600, color: "ink" })}
						>
							Sign in
						</Anchor>
					</Stack>
				</Stack>
			</LayoutHeader>

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
