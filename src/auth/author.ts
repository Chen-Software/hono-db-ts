/**
 * author — session→forum-user resolution facade.
 *
 * Historically this module executed the `users`-table SQL itself (upsert on
 * first post, fallback lookup, activity-counter resync). That SQL now lives in
 * the user service (`src/services/users.ts`) so every `sql.unsafe` in the
 * codebase is gated behind the service layer.
 *
 * This module is therefore a thin re-export: callers keep importing from
 * `@/auth/author` unchanged, and nothing here ever touches a database driver.
 * The Better Auth session plumbing itself lives in `src/auth/context.ts`.
 */
export { ensureForumUser, resolveForumUser, refreshUserActivity } from '@/services/users'
export type { ForumSession, UserRow } from '@/services/users'
