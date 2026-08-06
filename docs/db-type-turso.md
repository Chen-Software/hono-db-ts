# Database type: `turso`

Turso is an **edge SQLite** database built on libSQL. This project supports it as
a unified `DATABASE_TYPE=turso`, where `TURSO_URL` decides **local** vs **cloud**.
Because Turso is SQLite-compatible, it reuses the existing SQLite schema and the
same query surface.

---

## Overview

| Aspect | Local TursoDB | Turso Cloud |
| ------ | ------------- | ----------- |
| `TURSO_URL` | `file:///…/tursodb.db` | `libsql://…turso.io` |
| Auth | none | `TURSO_AUTH_TOKEN` |
| Driver | `@libsql/client` (embedded) | `@libsql/client/http` (Worker) |
| Runs locally? | ✅ | ✅ |
| Runs on Cloudflare Worker? | ❌ | ✅ (via `@libsql/client/http`) |

- `DATABASE_TYPE` is **`turso`** for both. `tursodb` / `turso-cloud` are accepted
  as aliases; the `TURSO_URL` scheme (`file://` vs `libsql://`) is what actually
  distinguishes local from cloud.

---

## Environment variables

| Variable | Local | Cloud | Required |
| -------- | ----- | ----- | -------- |
| `DATABASE_TYPE` | `turso` | `turso` | ✅ |
| `TURSO_URL` | `file:///abs/path.db` | `libsql://…turso.io` | ✅ |
| `TURSO_AUTH_TOKEN` | — | libSQL token | cloud only |
| `DATABASE_URL` | — | — | optional fallback for local URL |

> The `file://` form requires an **absolute path** with three slashes
> (`file:///abs/path`). A `file://./relative.db` (two slashes + `./`) is invalid —
> libSQL treats `./` as a host.

Env example files:

- `.env.dev.turso` — local TursoDB dev config
- `.env.example.turso-cloud` — Turso Cloud template (**copy to `.env`**)
- `.env` — the real config (holds the auth token; gitignored)

---

## Local development (TursoDB)

```bash
bun run dev                  # run against file:///…/tursodb.db
bun run db:migrate --dev     # apply SQLite migrations to the local file
bun run test:tursodb         # endpoint tests against local TursoDB
```

Local TursoDB needs no account and no token.

---

## Turso Cloud — one-time setup

```bash
# 1. Install the Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash   # or: brew install tursodatabase/tap/turso

# 2. Authenticate
turso auth login

# 3. Create a database and capture its connection details
turso db create movies-db
turso db show movies-db --url            # → TURSO_URL (libsql://…)
turso db tokens create movies-db         # → TURSO_AUTH_TOKEN

# 4. Configure the app (copy the Turso template to .env)
cp .env.example.turso-cloud .env   # fill in TURSO_URL + TURSO_AUTH_TOKEN
```

Then use it locally:

```bash
bun run dev                  # run the app against Turso Cloud
bun run db:migrate           # apply SQLite migrations (prod, reads .env)
bun run test:turso           # endpoint tests against Turso Cloud
```

---

## Deploying the Turso worker

The Cloudflare Worker connects to Turso Cloud over **HTTPS** using
`@libsql/client/http` — the same driver as the deployed worker.

```bash
# 1. Store the token as a Worker secret (NOT a plain var)
echo "$TURSO_AUTH_TOKEN" | bun x wrangler secret put TURSO_AUTH_TOKEN --env=turso

# 2. Deploy (build generates wrangler.jsonc with the `turso` env)
bun run deploy:turso

# optional validation without deploying
bun run deploy:dry-run:turso
```

The generated `wrangler.jsonc` for `DATABASE_TYPE=turso`:

```jsonc
{
  "name": "movies-worker",
  "main": "src/worker.ts",
  "compatibility_flags": ["nodejs_compat"],
  "env": {
    "turso": {
      "name": "movies-worker-turso",
      "vars": { "TURSO_URL": "libsql://movies-db-<org>.turso.io" }
      // TURSO_AUTH_TOKEN is a Worker secret, not in this file
    }
  }
}
```

- Deploys as `movies-worker-turso`.
- **No D1 settings** and **no Hyperdrive** — Turso's HTTP protocol needs neither.

---

## Architecture

### Local path (`src/main.ts` + repo factory)

`DATABASE_TYPE` is read at **build time** by Bun macros (`src/macros/db.ts`).
`src/repo/factory.ts` picks the repo for the active dialect:

- `turso` → `createTursoMoviesRepo(createTursoClient({ url, authToken }))`

Files involved:

- `src/db/turso-client.ts` — `createTursoClient()` (local `@libsql/client`)
- `src/repo/movies-repo-turso.ts` — **async** libSQL repo (Turso is async, unlike
  `bun:sqlite` which is sync)

### Worker path (`src/worker.ts`)

The Worker has **no macros**; it selects storage from the bindings at runtime:

```ts
if (env.TURSO_URL)        → Turso Cloud (@libsql/client/http)
if (env.HYPERDRIVE)       → Neon (Hyperdrive)
else                      → D1 (env.DB)
```

- `src/db/turso-worker-client.ts` — `createTursoWorkerClient()` uses
  `@libsql/client/http` and rewrites `libsql://` → `https://`.

> **Why `@libsql/client/http` on the Worker?** The WebSocket build
> (`@libsql/client/web`) is unreliable in Cloudflare Workers (it can hang or
> return error 1042). The HTTP build uses plain `fetch`, which Workers support
> natively. This is also why **Hyperdrive is not needed** for Turso — the HTTP
> protocol needs no TCP proxy (unlike Neon's TCP Postgres).

---

## Scripts reference

| Script | Purpose |
| ------ | ------- |
| `bun run dev` | Run the app against local TursoDB or Turso Cloud |
| `bun run db:migrate --dev` | Migrate local TursoDB |
| `bun run db:migrate` | Migrate Turso Cloud (prod) |
| `bun run test:tursodb` | Endpoint tests against local TursoDB |
| `bun run test:turso` | Endpoint tests against Turso Cloud |
| `bun run deploy:turso` | Deploy `movies-worker-turso` |
| `bun run deploy:dry-run:turso` | Validate the Turso bundle without deploying |
