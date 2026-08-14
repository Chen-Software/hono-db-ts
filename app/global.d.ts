import type { SQL } from 'bun'

declare module 'hono' {
  interface Env {
    Variables: Record<string, never>
    Bindings: Partial<{
      /** The shared SQL client (opened in app/server.ts). Present only when DATABASE_URL is set. */
      sql: SQL
    }>
  }
}
