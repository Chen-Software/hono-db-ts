import { SiteHeader } from "./site-header";
import { css } from "../../design-system/css";
import { Card, Heading, Stack, Text } from "./ui";
import AuthForm from "../islands/auth-form";

const FONT =
	"ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * Shared auth page chrome for `/sign-in` and `/sign-up`.
 *
 * Extracted so the GET renderer and the POST error-renderer share one layout.
 * Gated by `__BETTER_AUTH_ENABLED__` for the same DCE reasons as the route
 * files: with `BETTER_AUTH_ENABLED=false` the island (and its better-auth
 * dependency) is dead-code-eliminated and we show a plain notice instead.
 */
export function AuthPage(props: {
	mode: "sign-in" | "sign-up";
	next: string;
	error?: string;
	defaultEmail?: string;
	defaultName?: string;
}) {
	const isSignUp = props.mode === "sign-up";
	return (
		<div class={css({ minHeight: "100vh", bg: "#f7f7f8", color: "ink", fontFamily: FONT })}>
			<title>{isSignUp ? "Sign up · CodeForge" : "Sign in · CodeForge"}</title>

			<SiteHeader variant="app" />
			<main class={css({ maxWidth: "md", mx: "auto", px: 6, py: 16 })}>
				<Card>
					<div class={css({ p: 8 })}>
						<Stack gap="1" class={css({ mb: 6 })}>
							<Heading class={css({ fontSize: "2xl", fontWeight: 800 })}>
								{isSignUp ? "Create your account" : "Sign in"}
							</Heading>
							<Text class={css({ fontSize: "sm", color: "muted" })}>
								{isSignUp
									? "Sign up to join the discussion."
									: "Welcome back. Sign in to continue."}
							</Text>
						</Stack>

						{__BETTER_AUTH_ENABLED__ ? (
							<AuthForm
								mode={props.mode}
								next={props.next}
								error={props.error}
								defaultEmail={props.defaultEmail}
								defaultName={props.defaultName}
							/>
						) : (
							<Text class={css({ fontSize: "sm", color: "muted" })}>
								Authentication is currently disabled on this deployment.
							</Text>
						)}
					</div>
				</Card>
			</main>
		</div>
	);
}
