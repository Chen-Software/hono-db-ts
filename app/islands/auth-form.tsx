import { css, cx } from "../../design-system/css";
import { stack, vstack } from "../../design-system/patterns";
import { button, input } from "../../design-system/recipes";
import { useState } from "hono/jsx";
import { getAuthClient } from "../../src/auth/client";

type Mode = "sign-in" | "sign-up";

export interface AuthFormProps {
	mode: Mode;
	/** Where to send the user after a successful sign-in (from `?next=`). */
	next?: string;
	/**
	 * Server-side error to show on first render. Populated when the form is
	 * re-rendered after a failed native (non-hydrated) POST submit.
	 */
	error?: string;
	/** Pre-fill the email field (e.g. after a failed POST so the user retries). */
	defaultEmail?: string;
	/** Pre-fill the name field (sign-up). */
	defaultName?: string;
}

const FONT =
	"ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * AuthForm — a client island that drives Better Auth's email/password flow.
 *
 * It talks to the same-origin `/api/auth/*` endpoints through the typed
 * `authClient` (`src/auth/client.ts`). On success Better Auth sets the
 * session cookie on the response; we then hard-navigate (reloading the page
 * with the cookie) so the server-side guard (`getSession`) sees the session.
 *
 * The `next` param comes from the protected route's `?next=` redirect and is
 * validated to be a same-origin relative path (no open redirects).
 */
export default function AuthForm({
	mode,
	next,
	error,
	defaultEmail = "",
	defaultName = "",
}: AuthFormProps) {
	const [email, setEmail] = useState(defaultEmail);
	const [password, setPassword] = useState("");
	const [name, setName] = useState(defaultName);
	const [errorState, setError] = useState<string | null>(error ?? null);
	const [submitting, setSubmitting] = useState(false);

	const isSignUp = mode === "sign-up";

	const redirectTarget = () => {
		// Only allow same-origin relative paths; reject `//evil.com` etc.
		if (next && next.startsWith("/") && !next.startsWith("//")) return next;
		return "/";
	};

	const handleSubmit = async (e: Event) => {
		e.preventDefault();
		setError(null);
		setSubmitting(true);
		try {
			const res = isSignUp
				? await getAuthClient().signUp.email({ email, password, name })
				: await getAuthClient().signIn.email({ email, password });
			if (res.error) throw res.error;
			window.location.href = redirectTarget();
		} catch (err) {
			setError(
				(err as { message?: string }).message ??
					"Something went wrong. Please try again.",
			);
			setSubmitting(false);
		}
	};

	const switchHref = (to: Mode) =>
		`/${to}${next ? `?next=${encodeURIComponent(next)}` : ""}`;

	return (
		<form method="post" onSubmit={handleSubmit} class={vstack({ gap: "4", w: "full" })}>
			{isSignUp && (
				<label class={stack({ gap: "1.5" })}>
					<span
						class={css({ fontSize: "sm", fontWeight: 600, color: "ink", fontFamily: FONT })}
					>
						Name
					</span>
					<input
						type="text"
						name="name"
						value={name}
						onInput={(e) => setName((e.target as HTMLInputElement).value)}
						placeholder="Your name"
						autocomplete="name"
						required
						class={cx(input(), css({ w: "full", fontFamily: FONT }))}
					/>
				</label>
			)}

			<label class={stack({ gap: "1.5" })}>
				<span
					class={css({ fontSize: "sm", fontWeight: 600, color: "ink", fontFamily: FONT })}
				>
					Email
				</span>
				<input
					type="email"
					name="email"
					value={email}
					onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
					placeholder="you@example.com"
					autocomplete="email"
					required
					class={cx(input(), css({ w: "full", fontFamily: FONT }))}
				/>
			</label>

			<label class={stack({ gap: "1.5" })}>
				<span
					class={css({ fontSize: "sm", fontWeight: 600, color: "ink", fontFamily: FONT })}
				>
					Password
				</span>
				<input
					type="password"
					name="password"
					value={password}
					onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
					placeholder="••••••••"
					autocomplete={isSignUp ? "new-password" : "current-password"}
					minLength={8}
					required
					class={cx(input(), css({ w: "full", fontFamily: FONT }))}
				/>
			</label>

			{errorState && (
				<div
					role="alert"
					class={css({
						fontSize: "sm",
						color: "#e5484d",
						bg: "#fdecec",
						border: "1px solid #f5c2c2",
						px: 3,
						py: 2,
						rounded: "md",
						fontFamily: FONT,
					})}
				>
					{errorState}
				</div>
			)}

			<button
				type="submit"
				disabled={submitting}
				class={cx(
					button({ variant: "solid", size: "md", colorPalette: "orange" }),
					css({ w: "full", mt: 2, fontFamily: FONT }),
				)}
			>
				{submitting ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
			</button>

			<p
				class={css({
					fontSize: "sm",
					color: "muted",
					textAlign: "center",
					mt: 1,
					fontFamily: FONT,
				})}
			>
				{isSignUp ? (
					<>
						Already have an account?{" "}
						<a
							href={switchHref("sign-in")}
							class={css({ color: "accent", fontWeight: 600 })}
						>
							Sign in
						</a>
					</>
				) : (
					<>
						New here?{" "}
						<a
							href={switchHref("sign-up")}
							class={css({ color: "accent", fontWeight: 600 })}
						>
							Create an account
						</a>
					</>
				)}
			</p>
		</form>
	);
}
