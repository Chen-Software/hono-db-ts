# Forgejo — Architecture Overview (`packages/forgejo`)

> Verified against the actual source tree at `packages/forgejo` (Go module `forgejo.org`, Go 1.26).
> Forgejo is a self-hosted Git software forge, a community fork of Gitea. ~3,300 Go files (8,174 total).

## TL;DR
A **layered Go monolith**. Request flow is strictly top-down:

```
cmd (CLI) → routers/init.go (bootstrap) → routers/* (chi route trees)
   → modules/web + services/context (per-request context, auth, session)
   → services/* (business logic) → models/* (xorm data access) → DB/object stores
```

Infrastructure (git, indexer, cache, storage, queue, markup, federation, CI) lives in `modules/`.
Cross-cutting behaviors (cron, webhook, notify, packages, federation, actions) are orchestrated in `services/`.
The UI is **server-rendered `.tmpl` templates** enhanced with jQuery + htmx + Vue, bundled by **webpack via the Makefile** (not a SPA).

---

## 1. Entry point & bootstrap
- `main.go` → `cmd.NewMainApp()` (urfave/cli **v3**) → registers subcommands (`web`, `serv`, `hook`, `admin`, `migrate`, `doctor`, `manager`, …) plus `cmd/forgejo.CmdForgejo` which groups `CmdActions` and `CmdF3`.
- Web server: `cmd/web.go` → `runWeb` → if not installed, `serveInstall` (install wizard); else `serveInstalled` → `routers.InitWebInstalled(ctx)` (global init: git, i18n, storage, cache, DB engine, models, indexer, webhook, cron, SSH, Actions) then `routers.NormalRoutes()` and `listen(...)` (HTTP/HTTPS+ACME/FCGI/unix socket, graceful shutdown via `modules/graceful`).
- `cmd/forgejo/forgejo.go` is a *meta subcommand* (`forgejo-cli`) for runner management (`actions.go`: `generate-runner-token`, `register`) and the F3 data-migration layer (`f3.go`).

## 2. Routing layer — `routers/`
Custom `web.Route` wraps **`github.com/go-chi/chi/v5`** (`modules/web/route.go`), not macaron.
- `routers/web/` — server-rendered UI (`repo/`, `org/`, `user/`, `admin/`, `auth/`, `explore/`, `githttp.go`, `webfinger.go`, `nodeinfo.go`).
- `routers/api/v1/` — Gitea-compatible REST API (`/api/v1`).
- `routers/api/forgejo/v1/` — Forgejo extensions (`/api/forgejo/v1`).
- `routers/api/actions/` — Actions runner protocol (`/api/actions`).
- `routers/api/packages/` + `/v2` — package registry (OCI).
- `routers/private/` — internal API (`/api/internal`) used by git hooks, `serv`, manager, SSH.
- `routers/install/`, `routers/common/` (shared middleware: `Sessioner`, `InitDBEngine`, `auth`), `routers/utils/`.
- Mounted in `routers/init.go:NormalRoutes()`; web routes apply `Contexter()` + `webAuth(...)` + permission helpers (`reqSignIn`, `reqRepoAdmin`, …).

## 3. The `services/` vs `models/` boundary (the key decision)
- **`models/` = data access** (xorm ORM beans, one package per domain: `repo`, `user`, `issues`, `pull`, `org`, `packages`, `actions`, `webhook`, `forgefed`, `quota`, `moderation`, …).
- **`services/` = business logic/orchestration** (`repository`, `user`, `issue`, `pull`, `notify`, `webhook`, `cron`, `actions`, `packages`, `federation`, `authz`, `migrations`, `mailer`, …).
- Dependency direction is **services → models** (never reverse).
- **No DI framework.** Every function takes `ctx context.Context` first and calls `db.GetEngine(ctx)` (`models/db/context.go`). If the ctx carries an open transaction it returns that; otherwise the global `x` engine. `models/db.DefaultContext` is the background fallback.
- Example signatures:
  - service: `services/repository/repository.go` → `CreateRepository(ctx, doer, owner *user_model.User, opts CreateRepoOptions) (*repo_model.Repository, error)`
  - model: `models/repo/repo.go` → `GetRepositoryByID(ctx, id)` using `db.GetEngine(ctx)`.

## 4. Central data engine — `models/db/`
- `engine.go`: global `x *xorm.Engine` (fork `code.forgejo.org/xorm/xorm`), master/slave `EngineGroup` (PostgreSQL `pgx`, MySQL `go-sql-driver`). `InitEngineWithMigration` runs migrations then `SyncAllTables()`.
- `context.go`: `GetEngine(ctx)`, `TxContext`/`WithTx`/`WithTxOpts`, `AfterTx` (post-commit hooks).
- **DBs:** SQLite3, MySQL/MariaDB, PostgreSQL (master/slave replication supported).

## 5. Key `modules/` subsystems
| Module | Role |
|---|---|
| `modules/git` (+`gitrepo`) | Git CLI wrapper (command building, tracing via `modules/process`) |
| `modules/indexer` | Code search (bleve / elasticsearch / zoekt) + issues/stats indexes |
| `modules/cache` | Cache (memory, redis, memcache, twoqueue LRU) |
| `modules/setting` | Typed `app.ini` config (`setting.CfgProvider`, `setting.Database.Type`) |
| `modules/storage` | Object storage abstraction (`local`, S3/minio) for avatars/LFS/attachments |
| `modules/session` | HTTP session store (DB/redis/virtual) |
| `modules/markup` | Markup renderers (markdown, orgmode, csv, console, external, camo) |
| `modules/forgefed` | ActivityPub actors/activities (federation, WIP) |
| `modules/actions` | CI workflow YAML/DSL parsing (job_parser, github expr) |
| `modules/queue` | Async task queue (channel/redis/levelqueue) + WorkerPoolQueue |
| `modules/auth` | Credential tech (password, webauthn, openid, pam) |
| `modules/structs` | Shared API DTO package (imported as `api`) across layers |

## 6. Migrations (three layers)
- `models/gitea_migrations/` — inherited Gitea chain (`minDBVersion = 70`).
- `models/forgejo_migrations/` — Forgejo's own, id derived from **filename** (`v14a_…`, `v15b_…`).
- `models/forgejo_migrations_legacy/` — older integer-versioned Forgejo migrations (upgrade continuity).
- Auto-migrate vs strict version check decided in `routers/common/db.go`.

## 7. Frontend — `web_src/` + `templates/`
- **Not a SPA.** Server-rendered `.tmpl` (587 templates under `templates/`) via `modules/templates`; handlers render with `.Data`.
- JS: **vanilla + jQuery** + **htmx** + **Vue 3** components (`web_src/js/{features,components,webcomponents}`).
- CSS: hand-authored modular CSS + **Fomantic-UI** + **Tailwind** (PostCSS via webpack; no LESS pipeline).
- Build: **no `scripts` in package.json** — frontend built through **Makefile + webpack** (`npx webpack` using `webpack.config.js` + `tailwind.config.js`), output bundled into `public/` and embedded.

## 8. Cross-cutting / infra
- **Queue** (`modules/queue`): drives indexer, mailer, webhook delivery, mirror, task backends.
- **Cron** (`services/cron`): repo health, mirror sync, actions cleanup — started last in `routers/init.go`.
- **Webhooks** (`services/webhook` + `modules/webhook`): many providers (slack, discord, matrix, telegram, feishu, wechatwork, sourcehut, …), queue + retries.
- **Notifications** (`services/notify`): `Notifier` interface fans out to mail/webhook/UI/Actions/matrix after state changes.
- **Federation** (`modules/forgefed` + `services/federation` + `models/forgefed`): ActivityPub (WIP); endpoints in `routers/web/{webfinger,nodeinfo,activitypub}`.
- **CI / Actions**: `modules/actions` (parse) + `services/actions` (runtime: run/job/task/schedule/trust); runners via `routers/api/actions` and `forgejo actions register`.
- **Package registry**: `models/packages` (per-ecosystem: alpine, cargo, container, conan, debian, nuget, rpm, …) + `services/packages`, exposed at `/api/packages` and OCI `/v2`.

---
*Generated 2026-08-16 as an architecture review of `packages/forgejo`.*
