import { css } from "design-system/css";
import { useEffect, useState } from "hono/jsx";
import {
	Arrow,
	Content,
	InteractiveHoverCardRoot,
	Positioner,
	Trigger,
} from "../components/ui/hover-card-primitive";
import { AvatarBase } from "../components/ui/avatar-primitive";
import { Anchor } from "../components/ui/anchor";

type AuthUser = {
	id: string;
	name?: string | null;
	email?: string | null;
	image?: string | null;
};

type LoadState = "loading" | "anon" | "auth";

/**
 * UserAvatarCard — a client island that shows the signed-in user's avatar in
 * the nav and reveals a hover card with a link to their profile.
 *
 * It self-determines auth state on mount by hitting the same-origin
 * `/api/auth/get-session` (the session cookie is httpOnly, so the browser
 * can't read it directly — same approach as `AuthButton`). When signed out it
 * renders nothing (the nav's `AuthButton` already covers sign-in), so the
 * avatar only ever appears for a logged-in user. When signed in it renders an
 * `Avatar` as the hover-card trigger and, on hover/focus/tap, a card with the
 * user's name, email, and a "View profile" link to `/users/<id>`.
 *
 * It is only ever rendered behind `__BETTER_AUTH_ENABLED__` (see
 * `components/site-header.tsx`), so with `BETTER_AUTH_ENABLED=false` this
 * module — and the primitives it pulls in — is dead-code-eliminated from the
 * bundle.
 *
 * Note: this island uses the hover-card *primitives* directly rather than the
 * `HoverCard` wrapper component, because the wrapper delegates to a
 * `HoverCardIsland` that does not exist in this codebase; the primitives are
 * self-contained and include the full interactive open/close logic.
 */
export default function UserAvatarCard() {
	const [state, setState] = useState<LoadState>("loading");
	const [user, setUser] = useState<AuthUser | null>(null);
	const [imgStatus, setImgStatus] = useState<
		"idle" | "loading" | "loaded" | "error"
	>("idle");

	useEffect(() => {
		let active = true;
		fetch("/api/auth/get-session", { credentials: "same-origin" })
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (!active) return;
				if (data && data.user) {
					setUser(data.user as AuthUser);
					setState("auth");
				} else {
					setState("anon");
				}
			})
			.catch(() => {
				if (active) setState("anon");
			});
		return () => {
			active = false;
		};
	}, []);

	// Resolve the avatar image asynchronously so a broken/missing URL falls
	// back to initials instead of a broken-image icon.
	useEffect(() => {
		if (!user?.image) {
			setImgStatus("idle");
			return;
		}
		setImgStatus("loading");
		const img = new Image();
		img.src = user.image;
		img.onload = () => setImgStatus("loaded");
		img.onerror = () => setImgStatus("error");
	}, [user?.image]);

	if (state === "loading") {
		// Stable placeholder so the nav doesn't jump when the island resolves.
		return (
			<span
				class={css({
					display: "inline-block",
					w: "2rem",
					h: "2rem",
					rounded: "full",
					bg: "colorPalette.subtle.bg",
					opacity: 0.5,
				})}
				aria-hidden="true"
			/>
		);
	}

	if (state === "anon" || !user) {
		return null;
	}

	const displayName = user.name || user.email || "Account";
	const profileHref = `/users/${user.id}`;

	return (
		<InteractiveHoverCardRoot
			openDelay={200}
			closeDelay={150}
			placement="bottom"
		>
			<Trigger asChild>
				<AvatarBase
					size="sm"
					name={user.name || undefined}
					src={user.image || undefined}
					status={imgStatus}
					alt={displayName}
				/>
			</Trigger>
			<Positioner>
				<Content>
					<Arrow />
					<div
						class={css({
							display: "flex",
							flexDirection: "column",
							gap: 1,
							minW: "12rem",
						})}
					>
						<span
							class={css({
								fontWeight: 700,
								fontSize: "sm",
								color: "fg.default",
							})}
						>
							{displayName}
						</span>
						{user.email && (
							<span
								class={css({
									fontSize: "xs",
									color: "fg.muted",
								})}
							>
								{user.email}
							</span>
						)}
						<Anchor
							href={profileHref}
							variant="plain"
							class={css({
								marginTop: 2,
								fontSize: "sm",
								fontWeight: 600,
								color: "colorPalette.solid.bg",
								_hover: { textDecoration: "underline" },
							})}
						>
							View profile
						</Anchor>
					</div>
				</Content>
			</Positioner>
		</InteractiveHoverCardRoot>
	);
}
