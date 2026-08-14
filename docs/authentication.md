# Authentication (Better Auth)

This document explains how authentication works in this starter, how to sign
users in and out, how to check the current user on both the server and the
client, and how to protect routes. It follows the official
[Better Auth on Hono / Cloudflare](https://hono.dev/examples/better-auth-on-cloudflare)
example, adapted to this project's SQLite-everywhere runtime.

## 1. What is auth here?

The app uses **[Better Auth](https://www.betterauth.com)** — a framework-agnostic
auth library — mounted as a Hono sub-app at **`/api/auth/*`**. It handles:

- **email + password** sign-up / sign-in / sign-out
- **sessions** — an opaque, signed `better-auth.session_token` cookie set on the
  browser, with `session` + `user` rows in the database
- **the `user` table** — the canonical "current user" for your SSR routes and
  islands

Auth is **optional and tree-shakeable**: a build with
`BETTER_AUTH_ENABLED=false` drops the entire `better-auth` + drizzle-adapter
subtree — verified at the bundle level that **zero `better-auth` symbols
remain** (the `betterAuthEnabled()` gate inlines to `if (false)`, so the
`mountBetterAuth` import and everything it pulls becomes dead code).

### The auth database

The auth tables (`user`, `session`, `account`, `verification`) live in the
**same** SQLite database as the rest of the app — there is no separate
datastore. The tables are:

- declared once in **`src/auth/schema.ts`** (drizzle sqlite schema — the single
  source of truth consumed by the drizzle adapter),
- rendered to DDL by **`src/auth/ddl.ts`** and written as
  **`drizzle/<ts>_auth_sqlite_create.sql`** by the migration pipeline
  (`bun run src/main.ts db:generate sqlite`). This step is **skipped entirely**
  when `BETTER_AUTH_ENABLED=false`, so a no-auth build's `drizzle/` output
  stays free of auth tables,
- applied locally at startup via `ensureAuthSchema` (`src/auth/migrate.ts`) and
  on Workers via the CF sqlite inline migrations or `wrangler d1 migrations
  apply`.

---

## 2. How it's wired (the Hono reference pattern)

| Concern | File | Role |
|---|---|---|
| Schema | `src/auth/schema.ts` | Better Auth tables (drizzle sqlite) |
| Options | `src/auth/options.ts` | `basePath: "/api/auth"`, email+password on |
| Instance | `src/auth/index.ts` | `createAuth(db, env)` → `betterAuth()` via drizzle adapter |
| Mount | `src/auth/mount.ts` | `mountBetterAuth()` → wires `GET|POST /api/auth/*` |
| Server session | `src/auth/context.ts` | `getSession(c)` for SSR routes |
| Client | `src/auth/client.ts` | `getAuthClient()` for islands / browser |
| Env macros | `src/macros/envs.ts` | `betterAuthEnabled/Url/Secret` (DCE gate) |

The runtime database differs by deployment, but the auth wiring is identical:

- **Local (`scripts/serve.ts`, `app/server.ts`)** — a bun:sqlite `SQL` client is
  wrapped with `drizzle-orm/bun-sql`, and `mountBetterAuth(client)` builds the
  instance **once** at startup.
- **Cloudflare D1 (`app/server.cf.ts`, `src/worker/d1.ts`)** — the `env.DB`
  binding is wrapped with `drizzle-orm/d1`. Because bindings are only available
  per-request, the instance is built **per request** (exactly like the Hono
  example's `auth(c.env)`).

The handler is registered **before** the JSON query app's `/api` route so
`/api/auth/*` wins over `/api/...`:

```ts
// inside the honox `init` callback
const { mount } = await mountBetterAuth(sql)
mount(app)                       // app.on(['GET','POST'], '/api/auth/*', …)
app.route('/api', buildQueryApp(sql))   // must come AFTER
```

### Opt-out / dead-code elimination

All `BETTER_AUTH_*` reads go through **Bun macros** in `src/macros/envs.ts`:

```ts
betterAuthEnabled() // process.env.BETTER_AUTH_ENABLED !== "false"
betterAuthUrl()     // process.env.BETTER_AUTH_URL
betterAuthSecret()  // process.env.BETTER_AUTH_SECRET
```

These inline to literals at build time. The `mountBetterAuth` import is only
ever referenced inside `if (betterAuthEnabled())`, so a build with
`BETTER_AUTH_ENABLED=false` collapses that branch to dead code and the whole
auth subtree is dropped. The Vite UI builds use the equivalent
`__BETTER_AUTH_ENABLED__` `define`.

---

## 3. Environment variables

| Variable | Used for | Example |
|---|---|---|
| `BETTER_AUTH_ENABLED` | Compile-time gate (DCE). **The literal `"false"` → off; anything else — *including unset* — → on.** | `false` |
| `BETTER_AUTH_URL` | Public base URL of the auth endpoints. | `http://localhost:8787` (local) |
| `BETTER_AUTH_SECRET` | Signing secret (**≥ 32 chars**). **Never commit it.** | `dev-only-secret-…` (local) |

- Local dev: `.env.development` ships safe defaults; override
  `.env.development.local`.
- Production: set `BETTER_AUTH_URL` (your worker URL) as a var, and
  `BETTER_AUTH_SECRET` via **`wrangler secret put BETTER_AUTH_SECRET`** — it is
  read at runtime from `env.BETTER_AUTH_SECRET`, never from a committed value.

> [!CAUTION]
> **Removing the Better Auth env vars does NOT disable auth.** The flag is
> `process.env.BETTER_AUTH_ENABLED !== "false"`, so when it is **unset it
> defaults to ON (enabled)**. If you strip `BETTER_AUTH_URL` / `BETTER_AUTH_SECRET`
> / `BETTER_AUTH_ENABLED` from `.env.production`, the worker builds **with auth
> compiled back in but misconfigured** (no URL/secret → auth requests fail at
> runtime). To run a no-auth deployment you must set `BETTER_AUTH_ENABLED=false`
> **explicitly**; the other auth vars can then be absent.

### Deploying without auth (no-auth build)

`BETTER_AUTH_ENABLED` is a **build-time** flag (not a runtime toggle on the
deployed worker). For the Cloudflare Workers build it is read by
`vite.ui.cf.config.ts` (`__BETTER_AUTH_ENABLED__` `define`) at config-eval time,
so set it in the **build environment** — i.e. in `.env.production` (loaded by
Bun under `NODE_ENV=production`) or inline in the build command — before running
`bun run scripts/ui-cf-build.ts`. The local Bun server (`scripts/serve.ts`) reads
the same flag at runtime, so you can flip it just by restarting with a different
env var.

When the flag is `false`:

- the `if (__BETTER_AUTH_ENABLED__)` block in `app/server.cf.ts` inlines to
  `if (false)` and Rollup drops the **entire** Better Auth subtree from the
  worker bundle (the `/api/auth/*` handler, `better-auth`, the drizzle adapter,
  and `getSession`/`setSession` are all gone);
- the `users/[id]` guard is removed, so that route becomes a **public**,
  enumerable profile endpoint;
- the sign-in / sign-up pages and the nav `AuthButton` render nothing (their JSX
  is guarded by the same flag), so the `better-auth` client is also tree-shaken
  from the browser bundle.

`BETTER_AUTH_SECRET` is **optional** in a no-auth build — it is only referenced
inside the auth mount/`getSession` path, which is eliminated, so you can deploy
without setting it. (When auth *is* enabled, the secret is mandatory or Better
Auth fails to initialize.)

This repo's `.env.production` currently does **not** set `BETTER_AUTH_ENABLED`,
so the production worker builds **with auth enabled** (the flag is `!== "false"`,
and unset → on). Set it explicitly to `false` to ship a no-auth deployment.

---

## 4. Authenticating a user

### Sign up / sign in / sign out (client — islands)

The typed client lives in `src/auth/client.ts`. It is **lazy** (`getAuthClient()`)
so the module stays side-effect-free and can be tree-shaken when auth is off:

```ts
import { getAuthClient } from "@/auth/client";

const { data, error } = await getAuthClient().signUp.email({
  email, password, name,
});
const { data, error } = await getAuthClient().signIn.email({ email, password });
await getAuthClient().signOut();
```

For React islands you can also use Better Auth's React helpers:

```tsx
import { useSession, signOut } from "better-auth/react";
const { data: session } = useSession(); // revalidates as cookies change
```

### Server-side calls (SSR routes)

Inside a honox `createRoute`, use `getSession(c)` from `src/auth/context.ts`. It
forwards the request's cookies to Better Auth and resolves the current user, or
returns `null`:

```ts
import { createRoute } from "honox/factory";
import { getSession } from "@/auth/context";

export default createRoute(async (c) => {
  const session = await getSession(c);
  if (!session?.user) return c.redirect("/sign-in");
  return c.render({ user: session.user });
});
```

> `getSession(c)` is **Worker-bundlable**: it consumes the auth instance that
> the entry already attached to the context (`c.env.auth` locally, `c.env.DB` →
> `drizzle-orm/d1` on Workers) and never imports a `bun:sqlite` driver itself.

---

## 5. Checking if a user is authenticated

Two answers, depending on where you are:

- **Server (SSR route)** — `await getSession(c)`; it's `null` when unauthenticated:
  ```ts
  const session = await getSession(c);
  if (!session) {
    // not authenticated
  } else {
    session.user;    // { id, email, name, image, emailVerified, … }
    session.session; // { token, expiresAt, userId, … }
  }
  ```
- **Client (island / browser)** — `await getAuthClient().getSession()` returns
  `{ data }`, or `{ data: null }` when logged out; or use `useSession()` for
  reactive updates.

The mounted endpoints (`GET|POST /api/auth/*`) also speak it directly:

```bash
# signed in → { session: {...}, user: {...} }
curl -b "better-auth.session_token=$COOKIE" http://localhost:8787/api/auth/get-session
# anonymous → null
curl http://localhost:8787/api/auth/get-session
```

---

## 6. Protecting a route (example: `users/[id]`)

Yes — the file-based route is easily gated. The **shipped** `app/routes/users/[id].tsx`
resolves the session and **redirects to `/sign-in`** when absent. It also enforces
**ownership**: a signed-in user may only view *their own* profile, and any other
`id` is rejected with `403`:

```tsx
// app/routes/users/[id].tsx (shipped)
import { createRoute } from "honox/factory";
import { getSession } from "@/auth/context";

export default createRoute(async (c) => {
  const id = c.req.param("id");

  // Auth + owner gate. `__BETTER_AUTH_ENABLED__` is the Vite build-time flag;
  // a `BETTER_AUTH_ENABLED=false` build inlines `if (false)` and dead-code-
  // eliminates the guard (and the `getSession` import it pulls).
  if (__BETTER_AUTH_ENABLED__) {
    const session = await getSession(c);
    if (!session?.user) return c.redirect(`/sign-in?next=/users/${id}`);
    if (session.user.id !== id) return c.json({ error: "forbidden" }, 403);
  }

  // … render the profile from `c.env.sql` …
});
```

The owner check is enforced in the shipped route above. Drop the
`if (session.user.id !== id)` line if you'd rather let any authenticated user
view any profile.

The same auth-aware control also lives in the **site nav**: every page now
renders `app/components/site-header.tsx`, which includes a self-contained
`AuthButton` island (`app/islands/auth-button.tsx`). It shows **Sign in** when
logged out and **Sign out** (calling `getAuthClient().signOut()`) when logged in,
and is gated behind `__BETTER_AUTH_ENABLED__` so it is tree-shaken out of
auth-disabled builds.

To protect **any** route, the same two-line gate at the top of the handler is
all you need — no route-specific middleware is required because the session
comes from the request cookies via `getSession(c)`.

---

## 7. Extending auth (OAuth, organization, plugins)

To add providers (Google, GitHub, …) or plugins:

1. Add the provider keys to your env + Better Auth options in `src/auth/options.ts`.
2. Regenerate the drizzle schema so new tables/columns are created. The starter
   ships the schema pre-written in `src/auth/schema.ts`; regenerate it with the
   bundled CLI config:

   ```bash
   bun run better-auth:generate
   # ≡ better-auth generate --config ./better-auth.config.ts --output ./src/auth/schema.ts
   ```

   This re-runs `@better-auth/cli generate` against `better-auth.config.ts`,
   which uses `@libsql/client` so it runs under **Node**, not just Bun.
3. Render + apply the migration so the new DDL lands in the database:

   ```bash
   bun run src/main.ts db:generate sqlite   # writes drizzle/<ts>_auth_sqlite_create.sql (+ <ts>_auth_*.sql)
   bun run src/main.ts db:migrate           # applies every drizzle/*.sql file
   ```

   On Cloudflare, the same `drizzle/*.sql` files are applied via the CF sqlite
   worker's inline migrations or `wrangler d1 migrations apply`.
4. Enable the plugin on the client (`getAuthClient()` in `src/auth/client.ts`).

The drizzle adapter is already wired, so plugins that add tables slot straight
in. `src/auth/schema.ts` stays the single source of truth — `src/auth/ddl.ts`
introspects it to render the DDL, so a column change is reflected with no
hand-edited SQL to drift.

---

## 8. Quick reference

| You want… | You call… |
|---|---|
| Sign up (email + password) | `getAuthClient().signUp.email({...})` |
| Sign in | `getAuthClient().signIn.email({...})` |
| Sign out | `getAuthClient().signOut()` |
| Current user (server) | `getSession(c)` → `session?.user` or `null` |
| Current user (client) | `getAuthClient().getSession()` / `useSession()` |
| Protect a route | `if (!(await getSession(c))?.user) return c.redirect('/sign-in')` |
| Disable auth entirely | `BETTER_AUTH_ENABLED=false` at **build time** (DCE). Leave it unset and auth is ON — only the literal `false` disables. |
