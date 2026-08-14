import { css } from "../../design-system/css";
import { Anchor, Button, Stack } from "./ui";
import { Header as LayoutHeader } from "./ui/layout";
import SearchBox from "../islands/search";
import ThemeSwitcher from "../islands/theme-switcher";
import AuthButton from "../islands/auth-button";

type Variant = "app" | "home";

type SiteHeaderProps = {
	/**
	 * `app`  — interior pages; nav links point at the real routes
	 *           (`/boards`, `/threads`, `/posts`) and "New thread" jumps to the
	 *           home page's composer (`/#new-thread`).
	 * `home` — the landing page; nav links are in-page anchors (`/#boards` …)
	 *           so the hero doesn't reload.
	 */
	variant?: Variant;
};

/**
 * SiteHeader — the single source of truth for the top navigation, used by
 * every page. It renders the brand, the primary nav, the search box, the theme
 * switcher, the auth control, and the "New thread" button.
 *
 * The auth control (`AuthButton`) is gated behind `__BETTER_AUTH_ENABLED__`.
 * With `BETTER_AUTH_ENABLED=false` the `&&` short-circuits to `false`, the
 * `<AuthButton/>` reference becomes dead, and — because that is the only use of
 * the import — Rollup/Vite tree-shakes the `better-auth` client out of the
 * bundle. This is the same DCE mechanism already used by the protected
 * `users/[id]` route.
 */
export function SiteHeader({ variant = "app" }: SiteHeaderProps) {
	const boardHref = variant === "home" ? "/#boards" : "/boards";
	const threadHref = variant === "home" ? "/#threads" : "/threads";
	const postHref = variant === "home" ? "/#posts" : "/posts";
	const newThreadHref = "/#new-thread";

	return (
		<LayoutHeader sticky>
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
						color: "ink",
					})}
				>
					<span
						class={css({
							display: "inline-block",
							w: 3,
							h: 3,
							rounded: "sm",
							bg: "accent",
						})}
					/>
					BBS Forum
				</Anchor>

				<nav class={css({ display: "flex", gap: 4, ml: 4 })}>
					<Anchor href={boardHref} variant="plain" class={css({ fontSize: "sm", color: "muted" })}>
						Boards
					</Anchor>
					<Anchor href={threadHref} variant="plain" class={css({ fontSize: "sm", color: "muted" })}>
						Threads
					</Anchor>
					<Anchor href={postHref} variant="plain" class={css({ fontSize: "sm", color: "muted" })}>
						Posts
					</Anchor>
				</nav>

				<Stack direction="horizontal" align="center" gap="3" class={css({ ml: "auto" })}>
					<SearchBox />
					<ThemeSwitcher />
					{__BETTER_AUTH_ENABLED__ && <AuthButton />}
					<Button as="a" href={newThreadHref} colorPalette="orange" size="sm">
						New thread
					</Button>
				</Stack>
			</Stack>
		</LayoutHeader>
	);
}
