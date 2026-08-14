import { css } from "../../design-system/css";
import { createRoute } from "honox/factory";
import { Anchor, Card, Heading, Stack, Text } from "../components/ui";
import { Header as LayoutHeader } from "../components/ui/layout";
import AuthForm from "../islands/auth-form";
import ThemeSwitcher from "../islands/theme-switcher";

const FONT =
	"ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

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
 */
export default createRoute(async (c) => {
	const next = c.req.query("next") ?? "";

	return c.render(
		<div class={css({ minHeight: "100vh", bg: "#f7f7f8", color: "ink", fontFamily: FONT })}>
			<title>Sign in · BBS</title>

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
							href="/sign-up"
							class={css({ fontSize: "sm", fontWeight: 600, color: "ink" })}
						>
							Sign up
						</Anchor>
					</Stack>
				</Stack>
			</LayoutHeader>

			<main class={css({ maxWidth: "md", mx: "auto", px: 6, py: 16 })}>
				<Card>
					<div class={css({ p: 8 })}>
						<Stack gap="1" class={css({ mb: 6 })}>
							<Heading class={css({ fontSize: "2xl", fontWeight: 800 })}>Sign in</Heading>
							<Text class={css({ fontSize: "sm", color: "muted" })}>
								Welcome back. Sign in to continue.
							</Text>
						</Stack>

						{__BETTER_AUTH_ENABLED__ ? (
							<AuthForm mode="sign-in" next={next} />
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
