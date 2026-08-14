import { css } from '../../styled-system/css'
import { Fragment } from 'hono/jsx'
import { createRoute } from 'honox/factory'
import SearchBox from '../islands/search'

/**
 * BBS home page — a forum-style landing UI rendered entirely on the server.
 *
 * Everything is read straight from the shared SQL client (`c.env.sql`, opened
 * in `app/server.ts`), so the page works with zero client JS: stats, board
 * cards, recent threads, latest posts and hot threads are all SSR queries.
 * When `DATABASE_URL` is unset (or a query fails) the sections degrade to an
 * empty state instead of crashing.
 */

type Stats = {
	users: number
	boards: number
	threads: number
	replies: number
	posts: number
}

type Board = {
	id: string
	name: string
	slug: string
	description: string
	moderator_name: string | null
	thread_count: number
}

type Thread = {
	id: string
	title: string
	pinned: number
	locked: number
	updated_at: string
	author_name: string | null
	board_name: string | null
	reply_count: number
}

type Post = {
	title: string
	updated_at: string
	author_name: string | null
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
	// SSR: read the shared SQL client directly (set by app/server.ts init).
	let stats: Stats | null = null
	let boards: Board[] = []
	let threads: Thread[] = []
	let posts: Post[] = []
	let hot: (Thread & { reply_count: number })[] = []
	// Options for the "new thread" form.
	let allBoards: { id: string; name: string }[] = []
	let authors: { id: string; name: string }[] = []
	// When `?edit=<id>` is set, that thread renders its inline title editor.
	const editId = c.req.query('edit') ?? null

	try {
		const sql = c.env.sql
		if (sql) {
			const statRow = (await sql.unsafe(
				`SELECT (SELECT COUNT(*) FROM "users") AS users,
				        (SELECT COUNT(*) FROM "boards") AS boards,
				        (SELECT COUNT(*) FROM "threads") AS threads,
				        (SELECT COUNT(*) FROM "replies") AS replies,
				        (SELECT COUNT(*) FROM "posts") AS posts`,
			)) as Array<Stats>
			stats = statRow[0] ?? null

			boards = (await sql.unsafe(
				`SELECT b.id, b.name, b.slug, b.description,
				        u.name AS moderator_name,
				        (SELECT COUNT(*) FROM "threads" t WHERE t."boardId" = b.id) AS thread_count
				 FROM "boards" b
				 LEFT JOIN "users" u ON u.id = b."moderatorId"
				 ORDER BY thread_count DESC
				 LIMIT 8`,
			)) as Board[]

			threads = (await sql.unsafe(
				`SELECT t.id, t.title, t.pinned, t.locked, t."updated_at",
				        u.name AS author_name,
				        b.name AS board_name,
				        (SELECT COUNT(*) FROM "replies" r WHERE r."threadId" = t.id) AS reply_count
				 FROM "threads" t
				 LEFT JOIN "users" u ON u.id = t."authorId"
				 LEFT JOIN "boards" b ON b.id = t."boardId"
				 ORDER BY t.pinned DESC, t."updated_at" DESC
				 LIMIT 10`,
			)) as Thread[]

			posts = (await sql.unsafe(
				`SELECT p.title, p."updated_at", u.name AS author_name
				 FROM "posts" p
				 LEFT JOIN "users" u ON u.id = p."authorId"
				 WHERE p.published = 1
				 ORDER BY p."updated_at" DESC
				 LIMIT 6`,
			)) as Post[]

			hot = (await sql.unsafe(
				`SELECT t.id, t.title, t.pinned, t.locked, t."updated_at",
				        COUNT(r.id) AS reply_count
				 FROM "threads" t
				 LEFT JOIN "replies" r ON r."threadId" = t.id
				 GROUP BY t.id
				 ORDER BY reply_count DESC, t."updated_at" DESC
				 LIMIT 6`,
			)) as (Thread & { reply_count: number })[]

			allBoards = (await sql.unsafe(
				`SELECT id, name FROM "boards" ORDER BY "created_at" DESC LIMIT 50`,
			)) as { id: string; name: string }[]

			authors = (await sql.unsafe(
				`SELECT id, name FROM "users" ORDER BY "created_at" DESC LIMIT 20`,
			)) as { id: string; name: string }[]
		}
	} catch {
		stats = null
		boards = []
		threads = []
		posts = []
		hot = []
		allBoards = []
		authors = []
	}

	const hasDb = stats !== null
	const statItems: { label: string; value: number; key: string }[] = [
		{ label: 'Members', value: stats?.users ?? 0, key: 'users' },
		{ label: 'Boards', value: stats?.boards ?? 0, key: 'boards' },
		{ label: 'Threads', value: stats?.threads ?? 0, key: 'threads' },
		{ label: 'Replies', value: stats?.replies ?? 0, key: 'replies' },
		{ label: 'Posts', value: stats?.posts ?? 0, key: 'posts' },
	]

	return c.render(
		<div
			class={css({
				minHeight: '100vh',
				bg: '#f7f7f8',
				color: 'ink',
				fontFamily:
					'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
			})}
		>
			<title>BBS Forum</title>

			{/* ---------- Nav ---------- */}
			<header
				class={css({
					position: 'sticky',
					top: 0,
					zIndex: 10,
					display: 'flex',
					alignItems: 'center',
					gap: 6,
					px: 6,
					h: 16,
					bg: 'white',
					borderBottom: '1px solid token(colors.border)',
				})}
			>
				<a
					href="/"
					class={css({
						display: 'flex',
						alignItems: 'center',
						gap: 2,
						fontWeight: 800,
						fontSize: 'lg',
						textDecoration: 'none',
						color: 'ink',
					})}
				>
					<span
						class={css({
							display: 'inline-block',
							w: 3,
							h: 3,
							rounded: 'sm',
							bg: 'accent',
						})}
					/>
					BBS Forum
				</a>

				<nav class={css({ display: 'flex', gap: 4, ml: 4 })}>
					<a
						href="#boards"
						class={css({ fontSize: 'sm', color: 'muted', textDecoration: 'none', _hover: { color: 'ink' } })}
					>
						Boards
					</a>
					<a
						href="#threads"
						class={css({ fontSize: 'sm', color: 'muted', textDecoration: 'none', _hover: { color: 'ink' } })}
					>
						Threads
					</a>
					<a
						href="#posts"
						class={css({ fontSize: 'sm', color: 'muted', textDecoration: 'none', _hover: { color: 'ink' } })}
					>
						Posts
					</a>
				</nav>

				<div class={css({ display: 'flex', alignItems: 'center', gap: 3, ml: 'auto' })}>
					<SearchBox />
					<a
						href="#boards"
						class={css({
							px: 4,
							py: 2,
							rounded: 'md',
							bg: 'accent',
							color: 'white',
							fontSize: 'sm',
							fontWeight: 600,
							textDecoration: 'none',
							_hover: { bg: '#ea580c' },
						})}
					>
						New thread
					</a>
				</div>
			</header>

			{/* ---------- Hero / stats ---------- */}
			<section
				class={css({
					px: 6,
					py: 14,
					bg: '#111827',
					color: 'white',
				})}
			>
				<div class={css({ maxWidth: '6xl', mx: 'auto' })}>
					<p
						class={css({
							display: 'inline-block',
							px: 2.5,
							py: 1,
							rounded: 'full',
							bg: 'rgba(249,115,22,0.15)',
							color: '#fdba74',
							fontSize: 'xs',
							fontWeight: 600,
							letterSpacing: '0.05em',
							textTransform: 'uppercase',
						})}
					>
						Model-driven community
					</p>
					<h1
						class={css({
							mt: 4,
							fontSize: '4xl',
							fontWeight: 800,
							letterSpacing: '-0.02em',
						})}
					>
						Welcome to the BBS
					</h1>
					<p class={css({ mt: 3, maxWidth: '2xl', color: '#9ca3af', fontSize: 'lg' })}>
						A forum built on composable data models — boards, threads, replies and posts
						served straight from SQL. Join a board and start a conversation.
					</p>

					{hasDb ? (
						<div
							class={css({
								mt: 10,
								display: 'grid',
								gridTemplateColumns: 'repeat(5, 1fr)',
								gap: 4,
							})}
						>
							{statItems.map((s) => (
								<div
									key={s.key}
									class={css({
										px: 5,
										py: 5,
										rounded: 'xl',
										bg: 'rgba(255,255,255,0.06)',
										border: '1px solid rgba(255,255,255,0.1)',
									})}
								>
									<div class={css({ fontSize: '3xl', fontWeight: 800, color: 'white' })}>
										{s.value.toLocaleString()}
									</div>
									<div class={css({ mt: 1, fontSize: 'xs', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' })}>
										{s.label}
									</div>
								</div>
							))}
						</div>
					) : (
						<div
							class={css({
								mt: 8,
								px: 5,
								py: 4,
								rounded: 'xl',
								bg: 'rgba(255,255,255,0.06)',
								border: '1px solid rgba(255,255,255,0.1)',
								fontSize: 'sm',
								color: '#9ca3af',
							})}
						>
							No database connection — set <code class={css({ color: '#fdba74' })}>DATABASE_URL</code> and
							run <code class={css({ color: '#fdba74' })}>db:seed</code> to see live data.
						</div>
					)}
				</div>
			</section>

			{/* ---------- Body ---------- */}
			<main class={css({ maxWidth: '6xl', mx: 'auto', px: 6, py: 10 })}>
				<div class={css({ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 })}>
					{/* ---- main column ---- */}
					<div class={css({ spaceY: 10 })}>
						{/* Boards */}
						<section id="boards">
							<h2
								class={css({
									display: 'flex',
									alignItems: 'center',
									gap: 2,
									mb: 4,
									fontSize: 'xl',
									fontWeight: 700,
								})}
							>
								Boards
								<span class={css({ fontSize: 'sm', fontWeight: 400, color: 'faint' })}>
									{stats ? `${stats.boards} total` : ''}
								</span>
							</h2>

							{boards.length > 0 ? (
								<div
									class={css({
										display: 'grid',
										gridTemplateColumns: 'repeat(2, 1fr)',
										gap: 4,
									})}
								>
									{boards.map((b) => (
										<a
											key={b.id}
											href={`/api/boards/${b.id}`}
											class={css({
												p: 5,
												rounded: 'xl',
												border: '1px solid token(colors.border)',
												bg: 'white',
												textDecoration: 'none',
												transition: 'box-shadow 150ms, transform 150ms',
												_hover: {
													boxShadow: '0 8px 24px rgba(17,24,39,0.08)',
													transform: 'translateY(-2px)',
												},
											})}
										>
											<div class={css({ display: 'flex', alignItems: 'center', gap: 2 })}>
												<span
													class={css({
														w: 2,
														h: 2,
														rounded: 'full',
														bg: 'accent',
														flexShrink: 0,
													})}
												/>
												<h3 class={css({ fontWeight: 700, fontSize: 'md', color: 'ink' })}>{b.name}</h3>
											</div>
											<p class={css({ mt: 2, fontSize: 'sm', color: 'muted', lineClamp: 2 })}>
												{b.description}
											</p>
											<div
												class={css({
													mt: 3,
													display: 'flex',
													alignItems: 'center',
													gap: 3,
													fontSize: 'xs',
													color: 'faint',
												})}
											>
												<span
													class={css({
														px: 1.5,
														py: 0.5,
														rounded: 'full',
														bg: '#fff7ed',
														color: '#c2410c',
														fontWeight: 500,
													})}
												>
													/{b.slug}
												</span>
												<span>{b.thread_count} threads</span>
												<span class={css({ display: 'flex', alignItems: 'center', gap: 1 })}>
													<span aria-hidden>👤</span>
													{b.moderator_name ?? 'unknown'}
												</span>
											</div>
										</a>
									))}
								</div>
							) : (
								<p class={css({ fontSize: 'sm', color: 'faint' })}>No boards yet.</p>
							)}
						</section>

						{/* New thread */}
						{hasDb && allBoards.length > 0 && authors.length > 0 ? (
							<section id="new-thread">
								<h2 class={css({ mb: 4, fontSize: 'xl', fontWeight: 700 })}>New thread</h2>
								<form
									method="post"
									action="/"
									class={css({
										rounded: 'xl',
										border: '1px solid token(colors.border)',
										bg: 'white',
										p: 5,
										spaceY: 3,
									})}
								>
									<input type="hidden" name="action" value="create" />
									<input
										name="title"
										placeholder="Thread title…"
										required
										maxLength={300}
										class={css({
											w: 'full',
											px: 3,
											py: 2,
											rounded: 'md',
											border: '1px solid token(colors.border)',
											fontSize: 'sm',
											outline: 'none',
											_focus: { borderColor: 'accent' },
										})}
									/>
									<div class={css({ display: 'flex', gap: 3 })}>
										<select
											name="boardId"
											required
											class={css({
												flex: 1,
												px: 3,
												py: 2,
												rounded: 'md',
												border: '1px solid token(colors.border)',
												fontSize: 'sm',
												bg: 'white',
											})}
										>
											<option value="">Board…</option>
											{allBoards.map((b) => (
												<option key={b.id} value={b.id}>
													{b.name}
												</option>
											))}
										</select>
										<select
											name="authorId"
											required
											class={css({
												flex: 1,
												px: 3,
												py: 2,
												rounded: 'md',
												border: '1px solid token(colors.border)',
												fontSize: 'sm',
												bg: 'white',
											})}
										>
											<option value="">Author…</option>
											{authors.map((u) => (
												<option key={u.id} value={u.id}>
													{u.name}
												</option>
											))}
										</select>
									</div>
									<button
										type="submit"
										class={css({
											px: 4,
											py: 2,
											rounded: 'md',
											bg: 'accent',
											color: 'white',
											fontSize: 'sm',
											fontWeight: 600,
											border: 'none',
											cursor: 'pointer',
											_hover: { bg: '#ea580c' },
										})}
									>
										Post thread
									</button>
								</form>
							</section>
						) : null}

						{/* Recent threads */}
						<section id="threads">
							<h2 class={css({ mb: 4, fontSize: 'xl', fontWeight: 700 })}>Recent activity</h2>
							{threads.length > 0 ? (
								<div class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', overflow: 'hidden' })}>
									{threads.map((t, i) => (
										<Fragment key={t.id}>
										<article
											class={css({
												px: 5,
												py: 4,
												display: 'flex',
												alignItems: 'center',
												gap: 4,
												borderTop: i === 0 ? 'none' : '1px solid token(colors.border)',
												_hover: { bg: '#fafafa' },
											})}
										>
											<div class={css({ flex: 1, minWidth: 0 })}>
												<div class={css({ display: 'flex', alignItems: 'center', gap: 2 })}>
													{t.pinned === 1 && (
														<span
															class={css({
																px: 1.5,
																py: 0.5,
																rounded: 'full',
																bg: '#fef3c7',
																color: '#92400e',
																fontSize: 'xs',
																fontWeight: 600,
															})}
														>
															Pin
														</span>
													)}
													{t.locked === 1 && (
														<span
															class={css({
																px: 1.5,
																py: 0.5,
																rounded: 'full',
																bg: '#fee2e2',
																color: '#991b1b',
																fontSize: 'xs',
																fontWeight: 600,
															})}
														>
															Locked
														</span>
													)}
													<a
														href={`/api/threads/${t.id}`}
														class={css({
															fontWeight: 600,
															fontSize: 'sm',
															lineClamp: 1,
															color: 'ink',
															textDecoration: 'none',
															_hover: { color: 'accent' },
														})}
													>
														{t.title}
													</a>
												</div>
												<div class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>
													{t.author_name ?? 'unknown'} · {t.board_name ?? '—'} ·{' '}
													{timeAgo(t.updated_at)}
												</div>
											</div>
											<div
												class={css({
													display: 'flex',
													alignItems: 'center',
													gap: 1.5,
													fontSize: 'sm',
													color: 'muted',
													flexShrink: 0,
												})}
											>
												<span aria-hidden>💬</span>
												{t.reply_count}
											</div>
										</article>

										{/* Inline title editor (shown when ?edit=<id>) */}
										{t.id === editId ? (
											<form
												method="post"
												action="/"
												class={css({
													px: 5,
													py: 3,
													borderTop: '1px solid token(colors.border)',
													bg: '#fff7ed',
													display: 'flex',
													gap: 3,
												})}
											>
												<input type="hidden" name="action" value="update-title" />
												<input type="hidden" name="id" value={t.id} />
												<input
													name="title"
													defaultValue={t.title}
													maxLength={300}
													class={css({
														flex: 1,
														px: 3,
														py: 1.5,
														rounded: 'md',
														border: '1px solid token(colors.border)',
														fontSize: 'sm',
														outline: 'none',
														_focus: { borderColor: 'accent' },
													})}
												/>
												<button
													type="submit"
													class={css({
														px: 3,
														py: 1.5,
														rounded: 'md',
														bg: 'accent',
														color: 'white',
														fontSize: 'xs',
														fontWeight: 600,
														border: 'none',
														cursor: 'pointer',
													})}
												>
													Save
												</button>
												<a
													href="/"
													class={css({
														px: 3,
														py: 1.5,
														rounded: 'md',
														border: '1px solid token(colors.border)',
														fontSize: 'xs',
														color: 'muted',
														textDecoration: 'none',
													})}
												>
													Cancel
												</a>
											</form>
										) : null}

										{/* Row actions */}
										<div
											class={css({
												px: 5,
												pb: 3,
												borderTop: i === 0 ? 'none' : 'none',
												display: 'flex',
												alignItems: 'center',
												gap: 2,
												fontSize: 'xs',
											})}
										>
											<a
												href={`/?edit=${t.id}`}
												class={css({ color: 'muted', textDecoration: 'none', _hover: { color: 'accent' } })}
											>
												Edit
											</a>
											<form method="post" action="/" class={css({ m: 0 })}>
												<input type="hidden" name="action" value="toggle-pin" />
												<input type="hidden" name="id" value={t.id} />
												<button
													type="submit"
													class={css({
														bg: 'transparent',
														border: 'none',
														p: 0,
														fontSize: 'xs',
														color: 'muted',
														cursor: 'pointer',
														_hover: { color: 'accent' },
													})}
												>
													{t.pinned === 1 ? 'Unpin' : 'Pin'}
												</button>
											</form>
											<form method="post" action="/" class={css({ m: 0 })}>
												<input type="hidden" name="action" value="toggle-lock" />
												<input type="hidden" name="id" value={t.id} />
												<button
													type="submit"
													class={css({
														bg: 'transparent',
														border: 'none',
														p: 0,
														fontSize: 'xs',
														color: 'muted',
														cursor: 'pointer',
														_hover: { color: 'accent' },
													})}
												>
													{t.locked === 1 ? 'Unlock' : 'Lock'}
												</button>
											</form>
											<form method="post" action="/" class={css({ m: 0 })}>
												<input type="hidden" name="action" value="delete" />
												<input type="hidden" name="id" value={t.id} />
												<button
													type="submit"
													class={css({
														bg: 'transparent',
														border: 'none',
														p: 0,
														fontSize: 'xs',
														color: '#dc2626',
														cursor: 'pointer',
														_hover: { color: '#b91c1c' },
													})}
												>
													Delete
												</button>
											</form>
										</div>
										</Fragment>
									))}
								</div>
							) : (
								<p class={css({ fontSize: 'sm', color: 'faint' })}>No threads yet.</p>
							)}
						</section>
					</div>

					{/* ---- sidebar ---- */}
					<aside class={css({ spaceY: 8 })}>
						{/* Latest posts */}
						<section id="posts">
							<h2 class={css({ mb: 4, fontSize: 'lg', fontWeight: 700 })}>Latest posts</h2>
							{posts.length > 0 ? (
								<div class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', p: 2 })}>
									{posts.map((p, i) => (
										<div
											key={`${p.updated_at}-${i}`}
											class={css({
												px: 3,
												py: 3,
												rounded: 'lg',
												_hover: { bg: '#fafafa' },
											})}
										>
											<div class={css({ fontSize: 'sm', fontWeight: 600, lineClamp: 2 })}>{p.title}</div>
											<div class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>
												{p.author_name ?? 'unknown'} · {timeAgo(p.updated_at)}
											</div>
										</div>
									))}
								</div>
							) : (
								<p class={css({ fontSize: 'sm', color: 'faint' })}>No posts yet.</p>
							)}
						</section>

						{/* Hot threads */}
						<section>
							<h2 class={css({ mb: 4, fontSize: 'lg', fontWeight: 700 })}>Hot threads</h2>
							{hot.length > 0 ? (
								<div class={css({ rounded: 'xl', border: '1px solid token(colors.border)', bg: 'white', p: 2 })}>
									{hot.map((t, i) => (
										<div
											key={t.id}
											class={css({
												px: 3,
												py: 3,
												rounded: 'lg',
												display: 'flex',
												gap: 3,
												alignItems: 'flex-start',
												_hover: { bg: '#fafafa' },
											})}
										>
											<span
												class={css({
													display: 'inline-flex',
													alignItems: 'center',
													justifyContent: 'center',
													w: 5,
													h: 5,
													rounded: 'md',
													fontSize: 'xs',
													fontWeight: 700,
													bg: i < 3 ? 'accent' : '#f3f4f6',
													color: i < 3 ? 'white' : 'muted',
													flexShrink: 0,
												})}
											>
												{i + 1}
											</span>
											<div class={css({ minWidth: 0 })}>
												<a
													href={`/api/threads/${t.id}`}
													class={css({
														display: 'block',
														fontSize: 'sm',
														fontWeight: 600,
														lineClamp: 2,
														color: 'ink',
														textDecoration: 'none',
														_hover: { color: 'accent' },
													})}
												>
													{t.title}
												</a>
												<div class={css({ mt: 1, fontSize: 'xs', color: 'faint' })}>
													{t.reply_count} replies
												</div>
											</div>
										</div>
									))}
								</div>
							) : (
								<p class={css({ fontSize: 'sm', color: 'faint' })}>No hot threads yet.</p>
							)}
						</section>
					</aside>
				</div>
			</main>

			{/* ---------- Footer ---------- */}
			<footer
				class={css({
					mt: 4,
					borderTop: '1px solid token(colors.border)',
					bg: 'white',
					px: 6,
					py: 8,
				})}
			>
				<div class={css({ maxWidth: '6xl', mx: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 })}>
					<div class={css({ fontSize: 'sm', color: 'muted' })}>
						<span class={css({ fontWeight: 700, color: 'ink' })}>BBS Forum</span> — model-driven community demo.
					</div>
					<div class={css({ fontSize: 'xs', color: 'faint' })}>
						API: <code>/api/stats</code> · <code>/api/boards</code> · <code>/api/search?q=</code>
					</div>
				</div>
			</footer>
		</div>
	)
})

/**
 * POST / — handle the thread CRUD forms (create / update-title / toggle-pin /
 * toggle-lock / delete). Pure SSR: every action is a `<form method="post">`
 * submit, so no client JS is required. On success it redirects back to `/`.
 */
export const POST = createRoute(async (c) => {
	const sql = c.env.sql
	if (!sql) return c.redirect('/')

	const body = await c.req.parseBody()
	const action = typeof body.action === 'string' ? body.action : ''
	const id = typeof body.id === 'string' ? body.id : ''

	try {
		if (action === 'create') {
			const title = typeof body.title === 'string' ? body.title.trim() : ''
			const boardId = typeof body.boardId === 'string' ? body.boardId : ''
			const authorId = typeof body.authorId === 'string' ? body.authorId : ''
			if (!title || !boardId || !authorId) return c.redirect('/')

			const newId = crypto.randomUUID()
			const now = new Date().toISOString()
			await sql.unsafe(
				`INSERT INTO "threads" ("id","created_at","updated_at","boardId","authorId","title","pinned","locked") ` +
					`VALUES (?,?,?,?,?,?,0,0)`,
				[newId, now, now, boardId, authorId, title],
			)
		} else if (action === 'update-title' && id) {
			const title = typeof body.title === 'string' ? body.title.trim() : ''
			if (title) {
				await sql.unsafe(
					`UPDATE "threads" SET "title" = ?, "updated_at" = ? WHERE "id" = ?`,
					[title, new Date().toISOString(), id],
				)
			}
		} else if (action === 'toggle-pin' && id) {
			await sql.unsafe(
				`UPDATE "threads" SET "pinned" = CASE "pinned" WHEN 1 THEN 0 ELSE 1 END, "updated_at" = ? WHERE "id" = ?`,
				[new Date().toISOString(), id],
			)
		} else if (action === 'toggle-lock' && id) {
			await sql.unsafe(
				`UPDATE "threads" SET "locked" = CASE "locked" WHEN 1 THEN 0 ELSE 1 END, "updated_at" = ? WHERE "id" = ?`,
				[new Date().toISOString(), id],
			)
		} else if (action === 'delete' && id) {
			await sql.unsafe(`DELETE FROM "replies" WHERE "threadId" = ?`, [id])
			await sql.unsafe(`DELETE FROM "threads" WHERE "id" = ?`, [id])
		}
	} catch {
		// Keep the UX simple: any failure just bounces back to the list.
	}

	return c.redirect('/')
})
