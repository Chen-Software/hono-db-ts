declare module 'hono' {
  interface Env {
    Variables: Record<string, never>
    // SSR routes reach the database only over HTTP via the JSON query app
    // (mounted under /api). No SQL client is exposed on the request context —
    // see app/lib/api.ts and src/services/*.
    Bindings: Record<string, never>
  }
}
