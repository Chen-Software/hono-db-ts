import { css, cx } from "../../design-system/css";
import { button } from "../../design-system/recipes";
import { useEffect, useState } from "hono/jsx";
import { getAuthClient } from "../../src/auth/client";

const FONT =
	"ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

type Status = "loading" | "anon" | "auth";

/**
 * AuthButton — a client island that shows the right auth control in the nav.
 *
 * It self-determines state on mount by hitting the same-origin
 * `/api/auth/get-session` (the session cookie is httpOnly, so the browser
 * can't read it directly). When signed in it renders a **Sign out** button
 * that calls Better Auth's `signOut()` (clears the session cookie) and
 * hard-navigates home. When anonymous it renders a **Sign in** link.
 *
 * It is only ever rendered behind `__BETTER_AUTH_ENABLED__` (see
 * `components/site-header.tsx`), so with `BETTER_AUTH_ENABLED=false` this
 * module — and the `better-auth` client it pulls in — is dead-code-eliminated
 * from the bundle.
 */
export default function AuthButton() {
	const [status, setStatus] = useState<Status>("loading");
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let active = true;
		fetch("/api/auth/get-session", { credentials: "same-origin" })
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (!active) return;
				setStatus(data && data.user ? "auth" : "anon");
			})
			.catch(() => {
				if (active) setStatus("anon");
			});
		return () => {
			active = false;
		};
	}, []);

	if (status === "loading") {
		return (
			<span class={css({ fontSize: "sm", color: "fg.muted", fontFamily: FONT })}>…</span>
		);
	}

	if (status === "anon") {
		return (
			<a
				href="/sign-in"
				class={cx(
					button({ variant: "outline", size: "sm" }),
					css({ fontFamily: FONT }),
				)}
			>
				Sign in
			</a>
		);
	}

	const signOut = async () => {
		setBusy(true);
		try {
			await getAuthClient().signOut();
			window.location.href = "/";
		} catch {
			setBusy(false);
		}
	};

	return (
		<button
			type="button"
			onClick={signOut}
			disabled={busy}
			class={cx(
				button({ variant: "outline", size: "sm" }),
				css({ fontFamily: FONT }),
			)}
		>
			{busy ? "Signing out…" : "Sign out"}
		</button>
	);
}
