import { css } from '../../../design-system/css'
import { createRoute } from 'honox/factory'
import { Anchor, Badge, Button, Card, Heading, Stack, Text } from '../../components/ui'
import { SiteHeader } from '../../components/site-header'
import { BoardDrawer } from '../../components/board-drawer'
import { getSession } from '../../../src/auth/context'
import { apiFetch, apiPostForm } from '../../lib/api'

/**
 * Boards list page — `/boards`.
 *
 * Pure SSR. Shows every board as a card (slug, description, moderator, thread
 * count, latest activity) linking to `/boards/:uuid`. Order is by thread count
 * (desc) — the busiest boards first — with keyset pagination on that cursor.
 */

type BoardRow = {
	id: string
	name: string
	slug: string
	description: string
	moderator_name: string | null
	created_at: string
	thread_count: number
	last_activity: string | null
}

/** Format an ISO timestamp as a short relative age ("3h ago"). */
function timeAgo(iso: string): string {
	const t = new Date(iso).getTime()
	if (Number.isNaN(t)) return ''
	const s = Math.max(1, Math.floor((Date.now() - t) / 1000))
	if (s < 60) return `${s}s ago`
	const m = Math.floor(s / 60)
	if (m < 60) return `${m}m ago`
	const h = Math.floor(m / 60)
	if (h < 24) return `${h}h ago`
	const d = Math.floor(h / 24)
	if (d < 30) return `${d}d ago`
	return new Date(iso).toLocaleDateString('en-CA')
}

export default createRoute(async (c) => {
	const cursor = c.req.query('cursor') ?? ''
	// `?new=1` opens the "New board" drawer on load.
	const newBoard = c.req.query('new') === '1'
	// `?status=` carries post-action feedback back from a form submission.
	const status = c.req.query('status')
	const notice =
		status === 'created'
			? { tone: 'success' as const, text: 'Board created.' }
			: status === 'error'
				? { tone: 'error' as const, text: 'Could not create the board. Please try again.' }
				: null

	let boards: BoardRow[] = []
	let total = 0
	let users: { id: string; name: string; email: string }[] = []
	let currentUserId: string | undefined
	let nextCursor: string | null = null

	const session = await getSession(c).catch(() => null)
	currentUserId = session?.user?.id

	const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
	const page: any = await apiFetch(c, `/page/boards${q}`)
	if (page) {
		boards = page.boards ?? []
		total = page.total ?? 0
		users = page.users ?? []
		nextCursor = page.nextCursor ?? null
	}

	return c.render(
		<div class={css({ minHeight: '100vh', bg: '#f7f7f8', color: 'ink', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' })}>
			<title>Boards · BBS</title>
			<Nav />

			<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 10 })}>
				{notice && (
					<div
						role="status"
						class={css({
							mb: 6,
							px: 4,
							py: 3,
							rounded: 'md',
							fontSize: 'sm',
							fontWeight: 600,
							...(notice.tone === 'success'
								? {
										backgroundColor: '#ecfdf5',
										color: '#047857',
										border: '1px solid #a7f3d0',
									}
								: {
										backgroundColor: '#fef2f2',
										color: '#b91c1c',
										border: '1px solid #fecaca',
									}),
						})}
					>
						{notice.text}
					</div>
				)}
				{/* Heading */}
				<Stack direction="horizontal" justify="between" align="flex-end" wrap gap="4" class={css({ mb: 8 })}>
					<div>
						<Text class={css({ fontSize: 'xs', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'accent' })}>
							Browse communities
						</Text>
						<Heading class={css({ mt: 1, fontSize: '2xl', fontWeight: 800 })}>Boards</Heading>
						<Text class={css({ mt: 1, fontSize: 'sm', color: 'muted' })}>
							{total.toLocaleString()} board{total === 1 ? '' : 's'} · ordered by activity
						</Text>
					</div>
					<Stack direction="horizontal" gap="2">
						<Button as="a" href="/?compose=1" size="sm">
							New thread
						</Button>
						{users.length > 0 ? (
							<BoardDrawer users={users} defaultOpen={newBoard} />
						) : null}
					</Stack>
				</Stack>

				{/* Board grid */}
				{boards.length > 0 ? (
					<div class={css({ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 })}>
						{boards.map((b) => (
							<Anchor key={b.id} href={`/boards/${b.id}`} variant="plain">
								<Card
									class={css({
										p: 5,
										width: 'full',
										boxShadow: 'md',
										transition: 'box-shadow 150ms, transform 150ms',
										_hover: {
											boxShadow: '0 8px 24px rgba(17,24,39,0.08)',
											transform: 'translateY(-2px)',
										},
									})}
								>
									<Stack direction="horizontal" align="center" gap="2">
										<span class={css({ w: 2, h: 2, rounded: 'full', bg: 'accent', flexShrink: 0 })} />
										<Heading as="h3" class={css({ fontWeight: 700, fontSize: 'md', truncate: true, color: 'ink' })}>
											{b.name}
										</Heading>
									</Stack>
									<Text class={css({ mt: 2, fontSize: 'sm', color: 'muted', lineClamp: 2, minHeight: '2.5rem' })}>
										{b.description}
									</Text>
									<Stack direction="horizontal" gap="2" class={css({ mt: 3, fontSize: 'xs', color: 'faint' })}>
										<Badge variant="subtle">
											/{b.slug}
										</Badge>
									</Stack>
									<Stack
										direction="horizontal"
										justify="between"
										align="center"
										class={css({ mt: 3, pt: 3, borderTop: '1px solid token(colors.border)', fontSize: 'xs', color: 'faint' })}
									>
										<Text as="span">
											<strong class={css({ color: 'ink', fontWeight: 700 })}>{b.thread_count}</strong> threads
										</Text>
										<Text as="span" class={css({ truncate: true, maxWidth: '9rem' })}>
											{b.last_activity ? `active ${timeAgo(b.last_activity)}` : 'no threads'}
										</Text>
									</Stack>
								</Card>
							</Anchor>
						))}
					</div>
				) : (
					<div class={css({ py: 16, textAlign: 'center', rounded: 'xl', border: '1px dashed token(colors.border)', bg: 'white' })}>
						<Text class={css({ fontSize: 'sm', color: 'muted' })}>No boards yet.</Text>
					</div>
				)}

				{/* Pagination */}
				<Stack direction="horizontal" justify="between" align="center" class={css({ mt: 8 })}>
					{cursor ? (
						<Anchor href="/boards" variant="plain" class={css({ fontSize: 'sm', color: 'accent' })}>
							← Previous
						</Anchor>
					) : (
						<span />
					)}
					{nextCursor && (
						<Anchor
							href={`/boards?cursor=${encodeURIComponent(nextCursor)}`}
							variant="plain"
							class={css({ fontSize: 'sm', color: 'accent' })}
						>
							Next →
						</Anchor>
					)}
				</Stack>
			</main>

			<footer class={css({ mt: 4, borderTop: '1px solid token(colors.border)', bg: 'white', px: 6, py: 8 })}>
				<Stack direction="horizontal" class={css({ maxWidth: '6xl', mx: 'auto', fontSize: 'sm', color: 'muted' })}>
					<Text>
						<span class={css({ fontWeight: 700, color: 'ink' })}>BBS Forum</span> — model-driven community demo.
					</Text>
				</Stack>
			</footer>
		</div>,
	)
})

/** Shared top navigation — mirrors the home page's header. */
function Nav() {
	return <SiteHeader />
}

/**
 * POST /boards — create a new board (`action=create`). Requires an
 * authenticated session (the moderator defaults to the current user when the
 * form's dropdown is left unchanged). On success the user is returned to the
 * boards list; any failure (e.g. a duplicate slug) bounces back.
 */
export const POST = createRoute(async (c) => {
	// Board creation is delegated to the service layer via the JSON API.
	return apiPostForm(c, '/page/boards')
})
