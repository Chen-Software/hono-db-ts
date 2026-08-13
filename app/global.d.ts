import type { SQL } from 'bun'

declare module 'hono' {
  interface Env {
    Variables: {}
    Bindings: {
      /** The shared SQL client (opened in app/server.ts). Null when DATABASE_URL is unset. */
      sql: SQL | null
    }
  }
}
