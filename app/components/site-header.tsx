import { css } from "../../design-system/css";
import { Anchor, Search, Stack } from "./ui";
import { Header as LayoutHeader } from "./ui/layout";
import ThemeSwitcher from "../islands/theme-switcher";
import AuthButton from "../islands/auth-button";
import UserAvatarCard from "../islands/user-avatar-card";

type Variant = "app" | "home";

type SiteHeaderProps = {
	/**
	 * `app`  — interior pages; nav links point at the real routes
	 *           (`/repositories`).
	 * `home` — the landing page; nav links are in-page anchors (`/#repositories`)
	 *           so the hero doesn't reload.
	 */
	variant?: Variant;
};

/**
 * SiteHeader — the single source of truth for the top navigation, used by
 * every page. It renders the brand, the primary nav, the search box, the theme
 * switcher, and the auth controls.
 *
 * The auth controls are gated behind `__BETTER_AUTH_ENABLED__`. For signed-in
 * users the `UserAvatarCard` shows the avatar and a **Sign out** button inside
 * its hover card; `AuthButton` only contributes the **Sign in** link for
 * anonymous visitors. With `BETTER_AUTH_ENABLED=false` the `&&`
 * short-circuits to `false`, the `<AuthButton/>` reference becomes dead, and —
 * because that is the only use of the import — Rollup/Vite tree-shakes the
 * `better-auth` client out of the bundle. This is the same DCE mechanism
 * already used by the protected `users/[id]` route.
 */
export function SiteHeader({ variant = "app" }: SiteHeaderProps) {
	const repoHref = variant === "home" ? "/#repositories" : "/repositories";

	return (
		<LayoutHeader
			sticky
			class={css({
				bg: "colorPalette.surface.bg",
				borderBottom: "1px solid token(colors.border)",
			})}
		>
			<Stack direction="horizontal" align="center" gap="6" class={css({ flex: 1 })}>
				<Anchor
					href="/"
					variant="plain"
					class={css({
						display: "flex",
						alignItems: "center",
						gap: 2,
						fontWeight: 800,
						fontSize: "lg",
						color: "fg.default",
					})}
				>
					<span
						class={css({
							display: "inline-block",
							w: 3,
							h: 3,
							rounded: "sm",
							bg: "colorPalette.solid.bg",
						})}
					/>
					Git Forge
				</Anchor>

				<nav class={css({ display: "flex", gap: 4, ml: 4 })}>
					<Anchor href={repoHref} variant="plain" class={css({ fontSize: "sm", color: "fg.muted" })}>
						Repositories
					</Anchor>
					{__BETTER_AUTH_ENABLED__ && (
						<Anchor href="/users/me" variant="plain" class={css({ fontSize: "sm", color: "fg.muted" })}>
							Profile
						</Anchor>
					)}
				</nav>

				<Stack direction="horizontal" align="center" gap="3" class={css({ ml: "auto" })}>
					<Search
						placeholder="Search repositories…"
						class={css({ maxWidth: "24rem" })}
					/>
					<ThemeSwitcher />
					{__BETTER_AUTH_ENABLED__ && (
						<>
							<UserAvatarCard />
							<AuthButton />
						</>
					)}
				</Stack>
			</Stack>
		</LayoutHeader>
	);
}
