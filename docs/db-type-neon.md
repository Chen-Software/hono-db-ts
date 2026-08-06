# Database type: `neon`

Neon is a **serverless Postgres** database. In this project, `DATABASE_TYPE=neon`
uses the same `postgres-js` driver and Postgres schema as `postgres`, but points
at a Neon-hosted connection string. On the Cloudflare Worker, Neon is reached
through **Cloudflare Hyperdrive**.

---

## Overview

| Aspect | Value |
| ------ | ----- |
| `DATABASE_TYPE` | `neon` |
| Protocol | Postgres wire protocol (**TCP**) |
| Local driver | `postgres` (postgres-js) via `drizzle-orm/postgres-js` |
| Worker driver | `postgres` + **Hyperdrive** (needed for TCP on Workers) |
| Runs locally? | ✅ |
| Runs on Cloudflare Worker? | ✅ (via Hyperdrive) |

---

## Why Hyperdrive is required for Neon

There are **two** distinct problems that Hyperdrive solves: the transport
limitation, and the connection-lifecycle problem. Neither is optional for using
Postgres from a Worker.

### Problem 1 — Workers can't open raw TCP connections

Postgres speaks a **raw TCP wire protocol**. The `postgres-js` driver (`node:net`)
opens a long-lived TCP socket and streams protocol frames over it.

Cloudflare Workers **cannot open arbitrary TCP sockets**. A Worker only has
`fetch` (HTTP/HTTPS) — there is no `node:net`, no `net.Socket`, and no general
`connect()` primitive. So `postgres-js` literally cannot run inside a Worker;
its TCP connect call fails immediately.

This is the fundamental reason Neon needs a middleman. **Hyperdrive is that
middleman**: it sits on Cloudflare's edge, owns the real TCP connection to Neon,
and exposes it to the Worker through an internal network interface.

### Problem 2 — Postgres connections are expensive and limited

Even if a Worker could open a TCP socket, doing so per request would be
disastrous:

- **Cold start latency.** Establishing a TLS + auth handshake to Postgres takes
  ~30–100ms. Doing that on every request adds unacceptable latency.
- **Connection limits.** Postgres (and Neon) cap the number of concurrent
  connections. Workers can scale to thousands of instances; without pooling,
  each instance would open its own connection and blow past Neon's limit.
- **No persistence.** Workers are ephemeral — instances spin up/down constantly.
  A connection a Worker opened a moment ago may be gone a moment later.

### How Hyperdrive fixes both

1. **Transport.** Hyperdrive terminates the TCP connection to Neon on
   Cloudflare's edge. The Worker talks to Hyperdrive over Cloudflare's own
   network — no raw TCP sockets required from the Worker.
2. **Connection pooling.** Hyperdrive keeps a warm pool of Postgres connections
   open and multiplexes many Workers over them. One Hyperdrive config → a small,
   reusable set of DB connections.
3. **Reuse & latency.** Because the pool stays warm, requests reuse an existing
   connection instead of re-handshaking. This eliminates per-request cold-start
   cost and avoids Neon's connection cap.

> In code, that's why the Worker connects with `postgres(env.HYPERDRIVE.connectionString, { max: 1 })`:
> `max: 1` tells the driver not to open its own pool — Hyperdrive already pools,
> so a single logical connection per Worker is enough.

### Contrast with Turso

Turso is HTTP-based (`libsql://` → HTTPS `fetch`), so a Worker connects to it
directly over ordinary HTTP with **no TCP sockets and no pooling layer** — which
is why Turso needs **no Hyperdrive**. Neon, speaking raw TCP Postgres, has no such
escape hatch and requires Hyperdrive.

---

## Environment variables

| Variable | Description | Required |
| -------- | ----------- | -------- |
| `DATABASE_TYPE` | `neon` | ✅ |
| `DATABASE_URL` | Neon connection string (pooled for local app use) | local dev |
| `HYPERDRIVE_ID` | Hyperdrive config id (for the Worker `neon` env) | deploy |
| `DATABASE_POOL_SIZE` | Postgres pool size (default `10`) | optional |
| `NEON_BRANCH` | Linked Neon branch (from `neon env pull`) | optional |

Env example file: `.env.example.neon` (**copy to `.env`**, which is gitignored).

---

## Neon + Hyperdrive — one-time setup

```bash
# 1. Install & link the Neon CLI
bunx neon@latest auth        # browser OAuth
bunx neon@latest link        # pick org/project/branch
bunx neon@latest checkout production
bunx neon@latest env pull    # writes DATABASE_URL etc. into .env

cp .env.example.neon .env

# 2. Create a Hyperdrive config pointing at the Neon UNPOOLED connection string
bun x wrangler hyperdrive create neon-hyperdrive \
  --connection-string="postgresql://user:pass@host.region.aws.neon.tech/db"

# 3. Copy the returned Hyperdrive id → HYPERDRIVE_ID in .env
bun x wrangler hyperdrive list
```

Then use Neon locally:

```bash
bun run dev                 # run the app against Neon (local Postgres via .env.dev.neon)
bun run db:migrate          # apply Postgres migrations to Neon (prod, reads .env)
bun run db:migrate --dev    # apply migrations to the local Postgres
bun run test                # endpoint tests (dialect-aware; uses .env.dev.neon)
```

---

## Deploying the Neon worker

```bash
bun run deploy:neon          # build + wrangler deploy --env=neon
bun run deploy:dry-run:neon  # validate without deploying
```

The generated `wrangler.jsonc` for `DATABASE_TYPE=neon`:

```jsonc
{
  "name": "movies-worker",
  "main": "src/worker.ts",
  "compatibility_flags": ["nodejs_compat"],   // required for postgres-js TCP
  "env": {
    "neon": {
      "name": "movies-worker-neon",
      "hyperdrive": [
        { "binding": "HYPERDRIVE", "id": "00e65326-..." }
      ]
    }
  }
}
```

- Deploys as `movies-worker-neon`.
- **No D1 settings** and **no Turso** — the `neon` env only carries the Hyperdrive
  binding.
- The `nodejs_compat` flag provides `node:net`/`node:tls` for `postgres-js`.

---

## Architecture

### Local path (`src/main.ts` + repo factory)

`DATABASE_TYPE` is read at **build time** by Bun macros (`src/macros/db.ts`).
`src/repo/factory.ts` maps `neon` → `createPostgresMoviesRepo(createPostgresClient(url))`.

Files involved:

- `src/db/postgres-client.ts` — `createPostgresClient()` (local `postgres` driver)
- `src/repo/movies-repo-postgres.ts` — shared Postgres repo (Postgres locally,
  Neon on the Worker). Uses `.returning()` for identity `id`.

### Worker path (`src/worker.ts`)

The Worker selects storage from bindings at runtime:

```ts
if (env.TURSO_URL)        → Turso Cloud (@libsql/client/http)
if (env.HYPERDRIVE)       → Neon (Hyperdrive)
else                      → D1 (env.DB)
```

- `src/db/neon-client.ts` — `createNeonHyperdriveClient()` uses `postgres`
  (`max: 1`, since Hyperdrive pools) against `env.HYPERDRIVE.connectionString`.

> **Driver note:** Neon recommends using Hyperdrive with a **standard TCP Postgres
> driver** (`postgres-js`), **not** the Neon Serverless (WebSocket/HTTP) driver.
> That's why the Worker uses `postgres` here, even though Neon also offers an
> HTTP API.

---

## Scripts reference

| Script | Purpose |
| ------ | ------- |
| `bun run dev` | Run the app against Neon (local Postgres) |
| `bun run db:migrate` | Apply Postgres migrations to Neon (prod); `--dev` = local Postgres |
| `bun run test` | Endpoint tests (dialect-aware; `*.postgres.integration.test.ts`, uses `.env.dev.neon`) |
| `bun run deploy:neon` | Deploy `movies-worker-neon` (with Hyperdrive) |
| `bun run deploy:dry-run:neon` | Validate the Neon bundle without deploying |

---

## Turso vs Neon (quick comparison)

| | Turso | Neon |
| --- | ----- | ---- |
| Type | Edge SQLite (libSQL) | Serverless Postgres |
| Protocol | HTTP (`libsql://`) | TCP (Postgres wire) |
| Worker driver | `@libsql/client/http` | `postgres` via Hyperdrive |
| Hyperdrive needed? | ❌ | ✅ |
| Schema reused | SQLite (`schema/sqlite.ts`) | Postgres (`schema/postgres.ts`) |
| Repo | `movies-repo-turso.ts` (async) | `movies-repo-postgres.ts` |
