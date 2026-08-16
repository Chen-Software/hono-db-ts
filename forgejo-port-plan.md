# Porting Forgejo (Go) → Hono + Drizzle (TypeScript)

> Feasibility + phasing plan. Context: `packages/forgejo` is a ~3,300-file Go monolith (module `forgejo.org`).
> This workspace already has a working Hono + Drizzle + better-auth pattern (the forum app), so the stack is proven here.

## Verdict
- **Architecturally: yes.** Forgejo's layered shape (`routers → services → models → datastores`) maps almost 1:1 onto Hono (`routers`) + service functions (`services`) + Drizzle (`models`).
- **Practically: a faithful full port is a multi-year, multi-person effort.** The web + data layers are the *easy* 20%; git protocol, UI templates, SSH, CI, and federation are the other 80%.
- **Recommended:** don't attempt a big-bang port. Reimplement a **vertical slice** (e.g. org + repos + issues + REST API) to prove the pattern, then expand. The Hono+Drizzle stack carries over directly from the existing forum scaffolding.

## Go → TS mapping (what fits)
| Forgejo (Go) | Hono + Drizzle (TS) |
|---|---|
| chi `web.Route` / `routers/*` | Hono app + route handlers + middleware |
| `services/context` (Base/APIContext) | Hono `Context` + typed `c.get/c.set` variables |
| `models/*` xorm beans | Drizzle schema (`schema.ts`) + query helpers |
| `models/db` `GetEngine(ctx)` | Drizzle `db` injected via Hono context / factory |
| `db.WithTx` | `db.transaction(async (tx) => …)` |
| `modules/cache` | `ioredis` / in-memory LRU |
| `modules/queue` (channel/redis/level) | BullMQ / redis stream consumer |
| `modules/storage` (local/S3) | `fs` + `@aws-sdk/client-s3` |
| `modules/indexer` (bleve) | Meilisearch / Typesense client |
| `modules/session` | cookie session / `iron-session` |
| `modules/auth` (webauthn/pam) | `@simplewebauthn/server`; PAM via native addon |
| `modules/markup` | `marked` + DOMPurify |
| `services/cron` | `node-cron` |
| `services/webhook` | `fetch` + retry queue |
| `templates/*.tmpl` | Hono JSX / `@hono/react-renderer`, or a Go-template parser |
| `modules/git` (CLI) | `child_process` spawn `git` (or `isomorphic-git`) |
| git smart-HTTP | proxy to `git http-backend` (CGI) |
| embedded SSH (`modules/ssh`) | `ssh2` (heavy) or defer to system `sshd` |
| CI / Actions | reimplement runner protocol (large) |
| ActivityPub federation | reimplement (large, WIP upstream) |

## Porting difficulty map
- **Easy (mechanical):** schema → Drizzle; `models/*` queries; `services/*` pure logic; routing/middleware; cache/queue/storage/markup/webhook/cron.
- **Medium (redesign):** concurrency (goroutines/channels → async/await + queues); transactions; session/auth; search (bleve → Meilisearch).
- **Hard (research/reimplement):** git smart-HTTP + pack protocol; embedded SSH; the **587 `.tmpl` templates** (largest UI surface); LFS; CI/Actions runner protocol; ActivityPub federation.
- **Runtime caveat:** Go's compiled speed / low RAM vs Node's event loop — fine for most workloads, but CPU-bound git ops need care (offload to worker threads or shell out).

## Phased plan
**Phase 0 — Scope decision.** Faithful port vs vertical-slice MVP vs backend-only (drop server-rendered templates, build SPA later). *This dictates everything.*

**Phase 1 — Foundation.** Hono app skeleton mirroring the layer dirs (`server/`, `services/`, `models/`, `modules/`). Establish `db` injection (Hono `Context` variable or a request-scoped factory) as the `GetEngine(ctx)` equivalent. Bootstrap: load config (`app.ini` → TS config), connect Drizzle, start server (graceful shutdown via `node` signals).

**Phase 2 — Data layer.** Translate each `models/*` xorm struct → a Drizzle schema file. Run `drizzle-kit migrate`. Reuse existing Drizzle migrations where possible.

**Phase 3 — Models/queries.** Port `models/*` read/write functions to Drizzle query builders. Wrap writes in `db.transaction`.

**Phase 4 — Services + HTTP API.** Port `services/*` business logic (rewrite goroutine/channel code as async + queue). Port `routers/api/v1` + `routers/api/forgejo/v1` to Hono handlers; implement `services/context` as a Hono middleware that attaches `user`/`repo`/`org` to context. Get the REST API feature-parity for the slice.

**Phase 5 — Infra modules.** cache (ioredis), queue (BullMQ), storage (S3/fs), search (Meilisearch), markup, webhook delivery, cron, notifications.

**Phase 6 — Git + UI.** Shell out to `git` for repo ops; proxy smart-HTTP to `git http-backend`; implement LFS batch API. Replace the 587 `.tmpl` templates with Hono JSX (or keep `web_src` static assets + a thin template shim).

**Phase 7 — Hard subsystems (defer).** Embedded SSH, CI/Actions, ActivityPub federation. Treat as separate projects.

**Phase 8 — Parity & perf.** Integration tests against the Go reference; load test; benchmark.

## Key risks
1. **Template port (587 files)** — the single biggest UI cost. Mitigation: render via a Go-template-compatible parser, or rebuild UI as components.
2. **Git protocol correctness** — pack/smart-HTTP is subtle. Mitigation: proxy to `git http-backend` rather than reimplement.
3. **Concurrency model** — Go's goroutines ≠ Node's loop. Mitigation: queues + worker threads; avoid blocking the event loop.
4. **Volume** — faithful port ≈ years. Mitigation: vertical slice + incremental expansion.
5. **Performance/RAM** — Node heavier than Go for CPU-bound work. Mitigation: offload git to child processes / workers.

## Recommendation
Start with a **vertical slice**: org + repository + issues + the matching REST API, on the existing Hono+Drizzle+better-auth scaffolding. Prove the `services→models→Drizzle` pattern end-to-end, then expand domain by domain. Defer git protocol, SSH, CI, and federation until the core proves out.
