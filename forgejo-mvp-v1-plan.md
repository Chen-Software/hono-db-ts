# Forgejo (Go) → Hono + Drizzle (TS): MVP & v1 Plan

> Builds on `forgejo-architecture-overview.md` + `forgejo-port-plan.md`.
> Strategy: **vertical slice first**, expand to v1, defer the hard 80%.
> Reuses this workspace's existing **Hono + Drizzle + better-auth** scaffolding (the forum app).

## Definitions
- **MVP** — proves the pattern end-to-end: a real forge you can `git clone`/`push` to, with repos, orgs, issues, a REST API, and a minimal server-rendered UI. Small enough to ship in weeks.
- **v1** — a usable self-hosted forge for a small team: MVP + pull requests, permissions, webhooks, search, releases, markdown, admin. Still no SSH/LFS/full-CI/federation.
- **Deferred** — the hard subsystems, revisited only after v1 is real.

## Key decisions (resolve before coding)
1. **Schema**: greenfield Drizzle schema (recommended) vs byte-compatible mirror of Go Forgejo's xorm schema. Greenfield is far simpler unless you must migrate an existing instance.
2. **DB**: SQLite for dev, PostgreSQL for prod (matches the forum app).
3. **UI**: server-rendered **Hono JSX** (recommended — sidesteps the 587 `.tmpl` port) instead of a Go-template parser or a later SPA.
4. **Location**: put TS in a new `apps/forgejo/` (or `packages/forgejo-ts/`), **separate** from the Go `packages/forgejo`.

## Scope map
| Band | Contents |
|---|---|
| **MVP** | Repos CRUD · Org + teams · Session auth (better-auth) · Issues CRUD + comments/labels · REST API (`/api/v1`) · Git over HTTP · server-rendered UI |
| **v1 (added)** | Pull requests (diff/view/merge) · Permissions model · Webhooks + notifications · Basic code search · Releases + tags/assets · Markdown + mentions · Admin settings · CI webhook triggers |
| **Deferred** | SSH server · Git LFS · Actions CI runner · Package registry · ActivityPub federation · Elasticsearch/bleve · Enterprise SSO/LDAP · GitHub/GitLab import |

---

## MVP milestones

**M0 · Bootstrap**
- Scaffold `apps/forgejo` reusing the forum app's Hono + Drizzle + better-auth setup.
- Config loader (`app.ini` → TS config object). Graceful shutdown on `SIGINT`/`SIGTERM`.
- `db` injection: a Hono middleware that puts the Drizzle client on `c.get("db")` — the `GetEngine(ctx)` equivalent.
- Layout: `apps/forgejo/{server, routes, services, models, modules, ui}`.
- *Checkpoint:* server boots, migrates, `GET /api/v1/version` returns OK.

**M1 · Schema**
- Drizzle schemas: `User` (profile, alongside better-auth user), `Organization`, `Team`, `Repository`, `Issue`, `Comment`, `Label`, `Milestone`, `Access`.
- `drizzle-kit migrate`; seed a default admin.
- *Checkpoint:* tables exist; admin can authenticate via better-auth.

**M2 · Repos + REST API**
- Repo service: create / list / get / delete; resolve `{owner}/{repo}`; `git init` on disk (`modules/git` wrapper around `child_process` spawn).
- Endpoints: `GET/POST /api/v1/repos`, `GET/DELETE /api/v1/repos/{owner}/{repo}`, `GET /api/v1/orgs/{org}/repos`.
- *Checkpoint:* create a repo via API; bare repo exists on disk.

**M3 · Issues + REST API**
- Issue service: CRUD, comments, labels, milestones, filters (`?state=`, `?labels=`).
- Endpoints: `/api/v1/repos/{owner}/{repo}/issues`, `/issues/{id}`, `/issues/{id}/comments`.
- *Checkpoint:* full issue lifecycle via API.

**M4 · Git over HTTP** *(riskiest MVP item)*
- Smart-HTTP via proxy to `git http-backend` (CGI over `child_process` spawn); basic-auth against better-auth session/token.
- Endpoints: `GET/POST /{owner}/{repo}.git/info/refs`, `/git-upload-pack`, `/git-receive-pack`.
- *Checkpoint:* `git clone http://localhost/owner/repo.git` and a push succeed.
- *Mitigation:* proxy, don't reimplement pack protocol.

**M5 · Web UI (server-rendered)**
- Hono JSX pages: dashboard, repo view (tree via `git ls-tree`, README render), issue list/detail, new-issue form.
- Session gate middleware (`reqSignIn` equivalent).
- *Checkpoint:* browse a repo and create an issue in the browser.

## v1 milestones

**V1 · Pull requests**
- PR = Issue subtype with `head`/`base` refs. Diff via `git diff`/`git range-diff`; merge (ff / merge-commit / rebase) via `git`.
- API + UI for open/view/merge.

**V2 · Auth + permissions**
- better-auth 2FA (TOTP / WebAuthn, optional). Org teams; repo permission levels (read/write/admin). `reqRepoXxx` middleware equivalent in Hono.

**V3 · Webhooks + notifications**
- `Webhook` model; delivery via a queue (BullMQ) with retries; notify on push / issue / PR.

**V4 · Search + releases**
- Basic code search (substring over blobs, or Meilisearch later). Releases: tags + asset upload to `modules/storage` (S3/fs); tags UI.

**V5 · Markup + activity**
- `marked` + DOMPurify for markdown; mentions/`#123` refs; Atom feed.

**V6 · Admin + CI triggers**
- Admin user/repo management page; app settings; webhook-triggered CI (light — not the full Actions runner).

## Architecture specifics
- **DB injection:** `db` on Hono context → services take `db` (or `c`); transactions via `db.transaction(async tx => …)` replacing `db.WithTx`.
- **Git:** `modules/git` = thin `spawn("git", …)` wrapper; never reimplement pack/ssh.
- **UI:** Hono JSX (server-rendered) + Panda CSS (already in workspace). No `.tmpl` port.
- **Auth/session:** better-auth owns credentials + sessions; Forgejo profile fields live in a `users` table extended from better-auth's user.

## First sprint (≈1–2 weeks, concrete)
1. Scaffold `apps/forgejo` from the forum app's Hono+Drizzle+better-auth base.
2. Config loader + graceful shutdown + `db` context middleware.
3. M1 schemas + `drizzle-kit migrate` + admin seed.
4. M2 repo service + endpoints (disk `git init`).
5. M4 Git-HTTP proxy PoC behind basic auth (de-risk early — it's the scariest part).

## Risks & checkpoints
- **M4 git HTTP** is the highest-risk item — de-risk in the first sprint.
- **UI volume** — keep MVP UI minimal and componentized; resist rebuilding all 587 templates.
- **Schema parity** — only matters if migrating an existing Go instance; otherwise go greenfield.
- **Node vs Go perf** — offload CPU-bound git work to child processes / worker threads; never block the event loop.
