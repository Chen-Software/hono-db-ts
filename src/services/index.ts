/**
 * services — barrel for the data-access service layer.
 *
 * The REST layer (`src/http/app.ts`) and the SSR route handlers both depend
 * ONLY on these functions; none of them ever write raw `sql.unsafe` against a
 * route's `c.env.sql`. SQL runs through Drizzle (the entry points wrap the
 * concrete client in `drizzle(...)`), so the dangerous interpolation pattern
 * (Bun's `sql.unsafe(\`...${userInput}...\`)`) is impossible to reach from the
 * UI — and the `?`-parameterised helper functions in `./types` bind every
 * dynamic value.
 */
// Importing `@/models` first guarantees every model's `SqlSerialisable`
// capacity has composed and registered its derived Drizzle table in
// `tableRegistry` before the service modules below evaluate (they call
// `resolveTableThunk(...)` at module load to grab those tables).
import '@/models'

export * as repository from './repository'
export * as home from './home'
export * as search from './search'
export * as users from './users'
export * as webhooks from './webhooks'
export * as runs from './workflow-runs'
export type { Db } from './types'
export { createServices } from './factory'
