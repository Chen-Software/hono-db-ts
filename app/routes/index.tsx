import { css } from '../../styled-system/css'
import { createRoute } from 'honox/factory'
import Counter from '../islands/counter'

export default createRoute(async (c) => {
  const name = c.req.query('name') ?? 'Hono'

  // SSR: read the shared SQL client directly (set by app/server.ts init).
  let stats: Record<string, number> | null = null
  try {
    const sql = c.env.sql
    if (sql) {
      const row = (await sql.unsafe(
        `SELECT (SELECT COUNT(*) FROM "users") AS users,
                (SELECT COUNT(*) FROM "boards") AS boards,
                (SELECT COUNT(*) FROM "threads") AS threads,
                (SELECT COUNT(*) FROM "replies") AS replies,
                (SELECT COUNT(*) FROM "posts") AS posts`,
      )) as Array<Record<string, number>>
      stats = row[0] ?? null
    }
  } catch {
    stats = null
  }

  return c.render(
    <div class={css({ py: 8, textAlign: 'center' })}>
      <title>{name}</title>
      <h1 class={css({ fontSize: '3xl', fontWeight: 'bold' })}>Hello, {name}!</h1>
      <p class={css({ color: 'muted' })}>Honox UI served by the artefact CLI.</p>

      <section
        class={css({
          mx: 'auto',
          mt: 8,
          maxWidth: '28rem',
          rounded: 'xl',
          border: '1px solid token(colors.border)',
          p: 6,
          textAlign: 'left',
        })}
      >
        <h2 class={css({ fontSize: 'lg', fontWeight: 600 })}>BBS stats</h2>
        {stats ? (
          <ul class={css({ mt: 2, spaceY: 1, fontSize: 'sm' })}>
            <li>Users: {stats.users}</li>
            <li>Boards: {stats.boards}</li>
            <li>Threads: {stats.threads}</li>
            <li>Replies: {stats.replies}</li>
            <li>Posts: {stats.posts}</li>
          </ul>
        ) : (
          <p class={css({ mt: 2, fontSize: 'sm', color: 'faint' })}>
            No DB (DATABASE_URL unset) — run `db:seed` first.
          </p>
        )}
        <p class={css({ mt: 3, fontSize: 'xs', color: 'faint' })}>
          API: <code>/api/stats</code> · <code>/api/boards</code> ·{' '}
          <code>/api/search?q=</code>
        </p>
      </section>

      <Counter />
    </div>
  )
})
