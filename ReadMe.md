# artefact — Hono + Drizzle + Cloudflare Workers (D1)

A starter REST API for **Users** and **Posts**, built with **Hono** + **Drizzle ORM**,
run locally on **Bun** and deployed to **Cloudflare Workers + D1**.

It is deliberately organized as a **layered / hexagonal** application: the REST
API is a *transport adapter*, not the system itself. Business logic lives in
*application services* that depend only on *ports* (capabilities), and the rest
of the stack — Postgres, S3/R2, queues, telemetry — is an interchangeable set of
*infrastructure adapters*.

## Stack

- [Bun](https://bun.sh) — runtime, bundler & test runner
- [Hono](https://hono.dev) — web framework (used as the transport adapter)
- [Drizzle ORM](https://orm.drizzle.team) — SQL access over D1 (and can target Postgres)
- [typia](https://typia.io) — build-time schema/`validate` derivation (no runtime validator)
- [Biome](https://biomejs.dev) — lint & format
- [Cloudflare Workers](https://workers.cloudflare.com) + [D1](https://developers.cloudflare.com/d1/) — edge deployment

## Architecture

Top-down. **The REST API is a transport adapter into the application layer — it is
not the "service" in the architectural sense.**

```
                 ┌──────────────────────────────┐
   HTTP / REST   │         TRANSPORT            │   src/transport/*
   (Hono)        │   user-controller,           │   maps HTTP → application ops
                 │   post-controller            │   (thin; no business logic)
                 └──────────────┬───────────────┘
                                │   commands / queries
                                ▼
                 ┌──────────────────────────────┐
                 │        APPLICATION           │   src/application/*
                 │  UserService                  │   orchestrates use cases
                 │  PostService                 │   depends ONLY on ports
                 └──────────────┬───────────────┘
                                │   ports / interfaces
            ┌───────────────────┼────────────────────┬───────────────────┐
            ▼                   ▼                     ▼                   ▼
   ┌─────────────────┐ ┌───────────────┐    ┌──────────────┐   ┌──────────────────┐
   │ PostRepository  │ │ PostAssetStore│    │EventPublisher│   │ Observability    │
   │ UserRepository  │ │ (not BlobStore)│   │(domain events)│  │ (cross-cutting)  │
   └────────┬────────┘ └──────┬────────┘    └──────┬───────┘   └────────┬─────────┘
            │                 │                    │                    │
            ▼                 ▼                    ▼                    ▼
   ┌─────────────────┐ ┌───────────────┐   ┌──────────────┐  ┌──────────────────┐
   │ PostRepo        │ │ LocalPostAsset│   │ InMemoryBus  │  │ Noop / OTEL      │
   │ UserRepo        │ │ Store         │   │ (→ Queues…)  │  │ bridge           │
   │ (SQL / blob)    │ │ (→ S3 / R2)   │   │              │  │                  │
   └─────────────────┘ └───────────────┘   └──────────────┘  └──────────────────┘
        INFRASTRUCTURE ADAPTERS — src/providers/*, src/repository/*, src/services/*
```

### 1. Transport — *how* you talk to the application

`src/transport/*` are Hono apps that translate HTTP requests into application
operations and map domain errors onto HTTP status codes. They contain **no
business logic** and never name a database, a blob, or a queue.

```ts
POST   /users            → userService.createUser(command)
GET    /users?role=…     → userService.listUsers() | listUsersByRole(role)
GET    /users/:id        → userService.getUser(id)
DELETE /users/:id        → userService.deleteUser(id)

POST   /posts            → postService.create(command)
GET    /posts            → postService.list()
GET    /posts/:id        → postService.get(id)
GET    /posts/:id/history→ postService.getHistory(id)
PATCH  /posts/:id        → postService.edit(id, patch)
POST   /posts/:id/publish→ postService.publish(id)
DELETE /posts/:id        → postService.delete(id)
```

The same `UserService` / `PostService` could be driven by a CLI adapter or a
queue consumer with **zero changes** to the application layer.

### 2. Application — *what* the system does

`src/application/*` orchestrates use cases. `UserService` and `PostService`
depend only on **ports**, never on infrastructure:

```ts
PostService
  ├── PostRepository   // port: post persistence (findById / listByAuthor / historyOf)
  ├── EventPublisher   // port: domain events (post.created, post.published, …)
  └── PostAssetStore   // port: media, expressed as a BUSINESS capability
```

Key design choices already in place:

- **Repository exposes domain concepts, not SQL.** `PostRepository` offers
  `findById`, `listByAuthor`, `historyOf`, `append` — it never says `SELECT` or
  `INSERT`. Swapping the adapter (in-memory → Postgres → read-model) changes
  nothing in the service.
- **Assets are a business capability, not a generic blob API.** The port is
  `PostAssetStore.storeImage(postId, image)` / `deleteImage(assetId)`, *not* a
  `BlobStore.put/get/delete`. The application asks for what it needs; the adapter
  decides the key scheme and backend (S3, R2, local fs, memory).
- **Publishing is a use case, not a separate service** (`PostService.publish()`).
  If the system grows (scheduling, fan-out), it can be promoted to its own
  `PublishingService` *without changing the ports it uses*.
- **Do not create a service per noun.** `UserService`/`PostService` are small,
  capability-oriented facades — not CRUD wrappers for every entity.

### 3. Ports — the seams the application owns

`src/ports/*` are the interfaces the application depends on. **Who owns the
abstraction:** the application layer defines the port; infrastructure implements
it. The service can't tell a Postgres repo from an in-memory one.

| Port | File | Shape |
| ---- | ---- | ----- |
| `UserRepository` | `ports/user-repository.ts` | `insert / load / list / listByRole / delete` |
| `PostRepository` | `ports/post-repository.ts` | `findById / listLatest / listByAuthor / historyOf / create / append / delete` (+ outbox `DomainEvent`) |
| `PostAssetStore` | `ports/asset-store.ts` | `storeImage / deleteImage` (business-shaped) |
| `EventPublisher` | `ports/event-publisher.ts` | `publish(topic, payload)` — the "record a meaningful business event" seam |
| `TelemetryProvider` / `MonitoringProvider` | `providers/observability.ts` | `record / emit` (cross-cutting; `Noop*` defaults) |

### 4. Infrastructure — how the capabilities are implemented

`src/providers/*`, `src/repository/*`, `src/services/*` are the adapters:

- **Persistence**: `UserRepo` (`repository/user-repo.ts`) over SQL (D1) or a blob
  store; `PostRepo` over an append-only `VersionHistoryStore`
  (`services/version-history-store.ts`). Both implement the ports above.
- **Asset store**: `LocalPostAssetStore` (`providers/local-post-asset-store.ts`)
  → swap for an S3/R2-backed adapter later.
- **Events**: `InMemoryBus` (`services/event-bus.ts`) satisfies `EventPublisher`.
  It is the natural place to forward to Cloudflare Queues / Kafka / an OTEL bridge.
- **Outbox**: repo writes emit their lifecycle event as part of the *same* write
  (no dual-write gap). `PostRepo` subscribes to the store's `onChange` and
  forwards to the bus.

### 5. Composition root — the only place that knows the wiring

`src/main.ts` (local) and `src/cf-worker.ts` (Workers) are the composition roots.
This is the **single** location that picks which adapter backs each port:

```ts
// src/main.ts (local)
const bus = new InMemoryBus("app");
const userRepo  = UserRepo.overBlob("users", new MemoryStore()); // → swap overSql(...) for Postgres
const postRepo  = new PostRepo();                                // → swap PostgresPostRepository
const assetStore = new LocalPostAssetStore(new MemoryStore());   // → swap S3-backed store

const userService = new UserService({ repo: userRepo, bus });
const postService = new PostService({ repo: postRepo, bus, assets: assetStore });
```

On Workers the *same* services are wired with `UserRepo.overD1("users", drizzle(env.DB))`
and a `NoOpAssetStore` (replace with R2). **The application layer does not change.**

### 6. Telemetry is cross-cutting, not a constructor arg

Business code is **not** littered with `telemetry.startTimer()` /
`telemetry.record()`. The application records *meaningful business events* through
the `EventPublisher` (`post.published`, `user.deleted`, …). Request/span
instrumentation is a framework/runtime concern; the bus is the seam where OTEL or
metrics forwarding plugs in. `TelemetryProvider`/`MonitoringProvider` exist as
injectable capabilities but are intentionally **not** composed into every service.

### 7. Don't abstract everything "just because"

The abstraction is valuable where it names a real boundary (persistence, assets,
events) — not as a rule that every class needs an interface. `PostRepo` is the
*only* `PostRepository` today; that's fine. Introduce `PostgresPostRepository`
when (and if) a second backend is actually needed.

## Project layout

```
src/
  models/            Domain models & aggregates (User, Post) — typia-validated
  capacities/        Declarative decorators/macros (SqlTablisable, Identifiable,
                     Versioned, ContentAddressable, …) that turn models into
                     SQL-projection / versioned entities at build time
  application/       APPLICATION layer — UserService, PostService (depend on ports only)
  ports/             Ports/interfaces the application owns (repositories, asset
                     store, event publisher, observability)
  transport/         TRANSPORT adapters — Hono controllers (HTTP ⇄ application)
  repository/        INFRA adapters implementing the repository ports (UserRepo, PostRepo)
  providers/         INFRA adapters (sql-backend, d1-client, blob-store, object-store,
                     fs-provider, local-post-asset-store, observability, …)
  services/          Cross-cutting infra (InMemoryBus, version-history-store, hono-adapter)
  storage/           In-memory store backend used by local adapters
  tags/              Tagging capacity
  macros/            Build-time macros (Bun/Worker detection)
  generated/         Build-time artifact: models.json (derivation result of model:build)
  main.ts            Local Bun composition root + Bun.serve
  cf-worker.ts       Cloudflare Workers composition root (injects env.DB)
scripts/
  model-build.ts     Build-time model derivation → src/generated/models.json
  db-generate.ts     models.json → idempotent migrations/NNNN_create_*.sql
  build-cf.ts        Bun.build + ttsc/typia plugin → dist/cf-worker.js
  seed-test.ts       Seed 100 users + 100 posts and query them locally
migrations/          Generated D1 migration SQL (0001_create_users.sql, …)
wrangler.jsonc       Cloudflare Workers config (main: dist/cf-worker.js, D1 binding DB)
```

## Build process

Models are **derived at build time** (where typia runs) and saved for the runtime,
so the deployed Worker bundle needs no typia. The pipeline is layered and
non-redundant — codegen runs exactly once per pipeline:

```
model:build ──▶ src/generated/models.json
db:generate ──▶ migrations/NNNN_create_<table>.sql   (idempotent; skips covered tables)
        │
        ▼
   build:cf ──▶ dist/cf-worker.js          (Bun.build + typia plugin)
        │
        ▼
   db:migrate ──▶ wrangler d1 migrations apply artefact-db
        │
        ▼
   wrangler deploy
```

| Script | Purpose |
| ------ | ------- |
| `bun run model:build` | Derive SQL projection for every model → `src/generated/models.json` |
| `bun run db:generate` | Render idempotent migrations from the model plan |
| `bun run gen` | `model:build && db:generate` (single source of truth) |
| `bun run build:cf` | Bundle the Workers entry (`scripts/build-cf.ts`) |
| `bun run cf-dev` | `gen && build:cf && wrangler dev` |
| `bun run cf-deploy` | `gen && build:cf && wrangler deploy` |
| `bun run deploy` | `gen && build:cf && db:migrate && wrangler deploy` |
| `bun run prepare` | `gen` (runs automatically on `bun install`) |

## Local development

```bash
bun install            # also runs `prepare` → model:build && db:generate
bun run dev            # local Bun server (in-memory stores), http://localhost:3000
bun run seed:test      # seed 100 users + 100 posts and run queries locally
```

## Deploy to Cloudflare Workers + D1

```bash
# one-time: create the D1 database and set its id in wrangler.jsonc
bun x wrangler d1 create artefact-db

# full pipeline (codegen → bundle → migrate → deploy)
bun run deploy
```

The Worker picks its database from the `DB` binding at runtime; the application
and transport layers are identical to local — only the composition root differs.

## API

### users

| Method   | Path            | Result            | Success |
| -------- | --------------- | ----------------- | ------- |
| `POST`   | `/users`        | Create a user     | `201`   |
| `GET`    | `/users`        | List users (`?role=admin` filters) | `200` |
| `GET`    | `/users/:id`    | Get one user      | `200`   |
| `DELETE` | `/users/:id`    | Delete a user     | `204`   |

### posts

| Method   | Path                 | Result                       | Success |
| -------- | -------------------- | ---------------------------- | ------- |
| `POST`   | `/posts`             | Create a post                | `201`   |
| `GET`    | `/posts`             | List latest version of every post | `200` |
| `GET`    | `/posts/:id`         | Get latest version           | `200`   |
| `GET`    | `/posts/:id/history` | Full immutable version log   | `200`   |
| `PATCH`  | `/posts/:id`         | Edit → new immutable version | `200`   |
| `POST`   | `/posts/:id/publish` | Publish (use case)           | `200`   |
| `DELETE` | `/posts/:id`         | Delete post + history        | `204`   |

Errors return `{ "status": "error", "message": string }` with an appropriate
status (`400` invalid input, `404` not found, `409` conflict). The `PostAssetStore`
post-image capability is wired (`LocalPostAssetStore` locally, `NoOpAssetStore` on
Workers) and can be surfaced as a `POST /posts/:id/image` route when an asset
backend is connected.
