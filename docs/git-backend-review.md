# Git Backend Review — `src/git/` vs Forgejo `packages/forgejo/modules/git`

> Scope: compare our TypeScript smart-HTTP git backend (`src/git/`, 10 files, isomorphic-git + R2/node fs) against Forgejo's Go git stack (`modules/git` ~55 files + `modules/gitrepo` + `routers/web/repo/githttp.go`). Identify gaps, bugs, and a prioritized improvement plan.

## TL;DR

The transport skeleton is solid and — importantly — a *correct call*: Forgejo shells out to `git http-backend`, which is impossible on Cloudflare Workers, so reimplementing smart HTTP v1 in TS was the right architecture. But we are **transport-only today**:

- **Must-fix bugs** (P0): real git CLI can't authenticate (cookie-only auth), ref deletions silently no-op, tags are never advertised, archived/mirror repos are still pushable.
- **Biggest missing capability**: the entire read-side forge surface Forgejo builds on its git module — diff/compare, blame, archive, commit search, code search, branch/tag management, file history, signatures, language stats. None of it exists in `src/git/read.ts` beyond tree/blob/log.
- **Biggest architectural risk**: object-by-object reads over R2 (N GETs per clone/walk) with no batch strategy, plus full-body buffering on a Worker (memory/DoS).

---

## 1. What we have (`src/git/`)

| File | Role |
|---|---|
| `protocol.ts` | pkt-line encode/parse, flush, side-band-64k band-1 framing, ZERO_OID |
| `backend.ts` | `GitBackend` interface; `localGitBackend` (node:fs) + `r2GitBackend` (R2), bare `ensureRepo` |
| `fs-node.ts` | isomorphic-git `FsClient` over `node:fs/promises` |
| `fs-r2.ts` | isomorphic-git `FsClient` over an R2 bucket (implicit dirs) |
| `refs.ts` | advertise refs: HEAD (symref) + branches |
| `upload.ts` | upload-pack advertise + service: `want`/`done` parse, reachable-graph walk, `packObjects`, band-1 framing |
| `receive.ts` | receive-pack advertise + service: command parse, `indexPack`, `writeRef`, report-status |
| `routes.ts` | smart-HTTP transport: `GET info/refs`, `POST git-upload-pack`, `POST git-receive-pack`; session auth; owner-only push; `repo.push` queue action |
| `read.ts` | `listTree`, `readBlob`, `findReadme`, `logCommits` (used by `/api/page/repositories/:id/{tree,read,commits}`) |

Consumers: `src/http/app.ts` (read APIs), `src/worker/d1.ts` / `src/worker/sqlite.ts` (transport mount + `repo.push` → Cloudflare Queues).

---

## 2. What Forgejo has (surface map)

**Transport** (`routers/web/repo/githttp.go`): smart HTTP (upload-pack / receive-pack / **upload-archive**) + **dumb HTTP fallback** (`info/refs`, `info/packs`, loose objects, pack/idx files), `go-get=1` meta, **GZIP request decoding**, `Git-Protocol` v2 passthrough, Content-Type validation (401), caching headers (`Last-Modified`/`Cache-Control: public` for objects), repo-rename redirects, **wiki** (`.wiki.git`), **push-to-create** (with cached dummy info/refs), archived/mirror read-only, 2FA + PAT auth, repo-scoped + Actions task tokens, per-unit access checks, CORS, `update-server-info`.

**Core module** (`modules/git/`, ~55 files): command builder with arg-injection protection (`AddDynamicArguments`/`AddDashesAndList`), `cat-file --batch` batched readers + `pipeline/` (catfile, revlist, namerev, lfs), full object model (commit/tree/blob/tag/submodule), **SHA-1 + SHA-256**, blame (porcelain + ignore-revs), diff + compare + format-patch + hunk parsing, commit search (`--grep/--author/--committer/--before/--after`), **code search (grep)**, archive (zip/tar.gz/bundle), language stats, commit graph, GPG/signatures, notes, last-commit cache, **server hooks** (pre-receive/update/post-receive), `.gitattributes`/LFS, push options, remote/mirror fetch, `foreach-ref`, ref/branch/tag CRUD.

**Glue** (`modules/gitrepo/`): `OpenRepository`/wiki, `GetBranchesByPath`, default-branch symref, `WalkReferences`.

---

## 3. Gap analysis

### 3.1 Correctness bugs in our current code (fix first)

| # | Issue | Evidence | Impact |
|---|---|---|---|
| B1 | **Real git CLI cannot authenticate.** `getSession()` reads cookies only; git CLI sends `Authorization: Basic` and never a session cookie. No `WWW-Authenticate` header is set. | `routes.ts` L56-58, L90-92, L113-115; `auth/context.ts` `getSession` | `git clone/push` to a **private** repo from the CLI is impossible — only browser/API clients work. Blocks the core promise of a forge. |
| B2 | **Ref deletions silently succeed without deleting.** `newoid === ZERO_OID` reports `ok` but never calls a delete. | `receive.ts` L91-95 | `git push --delete origin branch` falsely succeeds; stale refs persist. |
| B3 | **Tags are never advertised or packed.** `listRefs` only lists branches; `include-tag` is advertised in upload-pack caps but never honored. | `refs.ts` L20-42; `upload.ts` L48-54 | `git clone` loses all tags; annotated tags (peeled `^{}`) unsupported. |
| B4 | **Archived / mirror repos accept pushes.** DB has `isArchived`/`isMirror`, but receive-pack never checks them. | `routes.ts` receive-pack L108-149 | Can push to archived/mirror repos (Forgejo rejects both: "repo is archived", "mirror repository is read-only"). |
| B5 | **No Content-Type validation** on POST (`application/x-git-*-request`); Forgejo returns 401 on mismatch. | `routes.ts` POST handlers | Protocol hygiene / cheap auth-vector hardening. |
| B6 | **Full request body buffered in memory** (`c.req.arrayBuffer()`) with no size cap. | `routes.ts` L96, L119 | On Workers (128 MB): a malicious/huge push can OOM the isolate — DoS vector. Forgejo streams stdin to git. |
| B7 | **Upload-pack ignores client `have`s** — always resends the entire reachable graph. | `upload.ts` L71-90 | Correct but wasteful; `git fetch` of large repos transfers everything every time (bandwidth + R2 GET cost). |
| B8 | **SHA-1 hardcoded** (40-hex regex, 40-zero `ZERO_OID`) though the DB column `objectFormatName` supports `sha256`. | `protocol.ts` L18; `receive.ts` L71; `services/repository.ts` seeds `'sha1'` | Forgejo supports both (`object_format.go`). Deferred, but the seams are all hardcoded. |
| B9 | **Uppercase repo names not normalized**; Forgejo lowercases the URL path. | `routes.ts` `stripGit` only | `Git/Repo.git` vs `git/repo.git` addressability mismatch. |

### 3.2 Transport / protocol gaps (vs `githttp.go`)

- **No dumb HTTP** (GET `info/refs`, `objects/info/packs`, loose objects, pack/idx). Old clients/tools only do dumb HTTP. (`GetInfoRefs` fallback, `GetInfoPacks`, `GetLooseObject`, `GetPackFile`, `GetIdxFile`.)
- **No `git-upload-archive`** service (Forgejo supports `git archive --remote`).
- **No protocol v2** (`Git-Protocol: version=2` header ignored). Modern `git` (≥2.26) sends it; we correctly serve v1 so the CLI falls back, but no `ref-prefix`/filter/`packfile-uris`.
- **No push options** (`push-options` capability — Forgejo has `modules/git/pushoptions`; used for `--push-option` CI signals).
- **No GZIP request bodies** (`Content-Encoding: gzip`).
- **No push-to-create** (Forgejo `PushCreateRepo` + cached dummy info/refs). Our receive-pack 404s when the DB row is missing.
- **No wiki git** (`.wiki.git` → wiki unit permission).
- **No repo-rename redirects** in git HTTP.
- **No ref advertisement features**: peeled tags, `delete-refs`, `atomic`, `report-status-v2`, `symref=` on receive-pack side, `object-format=sha256`.
- **No `go-get=1`** (Go module proxy support).

### 3.3 Read-side gaps (the forge UI surface — none implemented)

| Forgejo capability | File(s) | Needed for |
|---|---|---|
| Diff (commit / compare / file / format-patch) | `diff.go`, `diff_compare.go`, `repo_compare.go` | Commit page, **PRs (v1)**, compare |
| Blame (+ ignore-revs) | `blame.go`, `repo_blame.go` | File view |
| Archive download (zip/tar.gz/bundle) | `repo_archive.go` + `routers/.../download.go` | Release assets, "Download ZIP" |
| Commit search | `repo_commit.go` `searchCommits` | Commit search UI |
| Code search (grep) | `grep.go` | Code search (v1) |
| Branch CRUD / rename / paginated list / `GetRefsBySha` | `repo_branch.go` | Branch UI, PR base/target |
| Tag CRUD, annotated-tag deref, tags in advertisement | `repo_tag.go`, `tag.go` | Releases, tags UI |
| File history (`CommitsByFileAndRange`, `FileCommitsCount`, `GetCommitByPath`) | `repo_commit.go` | File history page |
| Files changed between commits (`FilesCountBetween`, `FileChangedBetweenCommits`) | `repo_commit.go` | PR/compare stats |
| Commit count / contributors | `repo_stats.go`, `repo_language_stats.go` | Stats, contributors |
| Last-commit-per-dir cache | `last_commit_cache.go` | Tree page perf |
| Submodules | `submodule.go` | File tree fidelity |
| `.gitattributes` / LFS | `repo_attribute.go`, `pipeline/lfs.go` | LFS + attribute-aware diff |
| GPG / signature verification | `object_signature.go`, `repo_gpg.go`, `signature.go` | Verified-commit badges |
| Notes | `notes.go` | `git notes` display |
| Commit graph | `repo_commitgraph.go` | Commit-graph generation |

### 3.4 Write-side gaps

- **No server hooks** (`hook.go`, `repo_hook.go`). Forgejo's authz, per-ref ACLs, branch protection, protected tags, and push events all ride the pre-receive/update/post-receive hook chain (`routers/private/hook/...`). We do the authz inline in `routes.ts` (owner-only) and emit `repo.push` from the handler — fine for MVP, but there is **no branch protection / force-push rule / protected-tag enforcement**, and no per-ref authorization for teams.
- **No object maintenance**: unreachable objects are never pruned; no repack, no `git gc`, no commit-graph. R2 has no server-side gc — need a scheduled maintenance path (like Forgejo's repo maintenance cron).
- **Push event is minimal**: Forgejo's post-receive hook passes pusher name/email/id, repo id, action permission, `GIT_PROTOCOL`, `SSH_ORIGINAL_COMMAND`, and computes per-ref old→new, branch-vs-tag, force-push. Our `repo.push` has owner/repo/ref/oid/pusherId/ts — enough for metadata, short of webhook payloads (missing old oid → can't compute forced-push / deleted-tag events).

### 3.5 Performance / architecture risks (R2-specific)

- **Object-by-object reads**: `collectReachable` (`upload.ts`) and `oidAtPath` (`read.ts`) each do a `git.readObject` → **1 R2 GET per object**. A 10k-object repo = 10k GETs per clone, plus `resolveRef`/`listBranches` per `info/refs`. Forgejo uses persistent `cat-file --batch` pipelines. This is the top scaling constraint and is architectural (isomorphic-git has no batch API over a custom FsClient).
- **`indexPack` per push** is CPU/memory heavy in JS on a 128 MB Worker for large packs.
- **No caching** of ref advertisement, README, or tree listings.
- `fs-r2.lstat` constructs a fresh fs adapter per call (`r2Fs(bucket).promises.stat`) — minor waste, easy fix.

### 3.6 Auth gaps

- No Basic-auth/PAT support (B1) → CLI unusable on private repos.
- No 2FA enforcement for git ops (Forgejo rejects plain password auth for 2FA users).
- No repo-scoped tokens / Actions task tokens; owner-only push (no teams/orgs, no read-role levels) — expected until orgs land, but the transport should be shaped to accept a token now.

---

## 4. What we do *better* / right calls

- **Reimplementing smart HTTP in TS instead of proxying `git http-backend`** — the port plan recommended CGI proxying, which is impossible on Workers. This is the right architecture and already proven by the e2e test (push → clone round-trip).
- **Storage abstraction** (`GitBackend` interface, node-fs vs R2) mirrors Forgejo's model (git objects on disk, `Repository` DB row = catalog) and keeps the transport storage-agnostic.
- **`repo.push` queue action** on successful push is a clean Forgejo-style event (matches `services/notify` push notification), already wired to Cloudflare Queues.
- **Empty-repo handling** (`ensureRepo` on info/refs for both services, empty advertisement, empty-tree read API) is correct and tested.
- **Band-1 side-band framing + double-framed report-status** shows real protocol care; the e2e test pins it.

---

## 5. Improvement roadmap

### P0 — correctness / "real git CLI works"
1. **Basic auth + PAT for the git transport.** Parse `Authorization: Basic`, look up a personal-access-token (or better-auth password+session fallback) for `GET/POST` git endpoints; set `WWW-Authenticate: Basic realm="CodeForge"` on 401; respect 2FA (reject password, allow token). *Unblocks private clone/push via CLI — the #1 gap.*
2. **Fix ref deletion** (B2): call `git.deleteRef` on `ZERO_OID`, and only then report `ok`.
3. **Advertise tags** (+ peeled `^{}` for annotated tags) in `info/refs`; honor `include-tag` when packing (add tag objects reachable from wants). *(isomorphic-git `listRefs` + manual peel via `readObject`.)*
4. **Enforce archived/mirror read-only** in receive-pack (403, mirror message), matching Forgejo.
5. **Body size cap + streaming**: reject >N (e.g. 500 MB) pushes; at minimum a hard cap before `arrayBuffer()`. Validate `Content-Type` on POSTs.
6. **Honor `have`s in upload-pack** (B7): walk from `want`s but stop at `have`-reachable commits; pack only the delta set. Big win for fetch bandwidth + R2 GET cost.

### P1 — v1 forge features
7. **Diff layer** (`diff.ts`): commit diff, compare two refs, rename detection, file list + hunk parse — unblocks commit page + PRs.
8. **Branch + tag services**: CRUD/rename, paginated list with counts, `GetRefsBySha`-style "branches containing this commit", tags in the UI + advertisement.
9. **Archive download**: stream zip/tar.gz by walking the tree (isomorphic-git `walk` + `readBlob`; no CLI needed).
10. **Commit search** (`log` with grep/author/committer/before/after via isomorphic-git filters) + **file history** (log `-- path`).
11. **Blame** (porcelain-style line→commit via walk or per-line `git.log` — expensive; batch later).

### P2 — parity, scale, hardening
12. **Batch object reads** over R2: a `cat-file --batch`-style adapter (read a pack/index once, serve multiple objects; or store a per-repo object index) — the architectural fix for P1/R2 costs.
13. **Object maintenance**: scheduled repack/prune (delete unreachable objects after a grace period), size accounting already exists in `r2MeasureSize` (queue handler).
14. **Push options, protocol v2, dumb HTTP, upload-archive, wiki git, push-to-create, repo redirects, `go-get=1`** — progressive parity with `githttp.go`.
15. **SHA-256 repos** (parameterize object-length/ZERO_OID — the seams are few).
16. **Server-side ref rules / branch protection** as a TS pre-receive equivalent (per-ref ACL check before `writeRef`).
17. **Signatures (GPG), submodules, `.gitattributes`/LFS, notes, language stats, commit graph** — as UI features demand them.
18. **Cache layer**: ref advertisement, README render, tree listing (Forgejo's `modules/cache` equivalent).

---

## 6. File-by-file mapping (ours → Forgejo)

| Ours | Forgejo equivalent |
|---|---|
| `routes.ts` | `routers/web/repo/githttp.go` (subset) |
| `protocol.ts` | (implied by git's wire protocol; Go delegates to git) |
| `upload.ts` | `git-upload-pack` via git CLI in `githttp.go` |
| `receive.ts` | `git-receive-pack` + `modules/git/hook.go` post-receive pipeline |
| `refs.ts` | `modules/git/repo_branch.go` `WalkReferences` + `foreachref/` |
| `read.ts` (tree/blob/log) | `repo_tree.go`, `blob.go`, `repo_commit.go` (tiny subset) |
| `backend.ts` / `fs-*.ts` | `modules/git/repo_base.go` + Forgejo's storage model (no analog — this is our Workers innovation) |
| — (missing) | `diff.go`, `blame.go`, `grep.go`, `repo_archive.go`, `repo_tag.go`, `repo_branch.go` (CRUD), `repo_compare.go`, `repo_stats.go`, `repo_language_stats.go`, `object_signature.go`, `submodule.go`, `notes.go`, `last_commit_cache.go`, `batch.go`/`pipeline/`, `object_format.go` |

---

## 7. Bottom line

The transport is a sound, tested foundation — the hard 20% is done and it runs on R2, which the Go reference cannot do. To become a *forge* rather than a *git server*:

1. **P0 fixes are small and unblock the core use case** (CLI auth, deletions, tags, archived/mirror, body cap) — do these next.
2. **The read-side forge surface (diff/branches/tags/archive/search) is entirely missing** — this is where v1 value lives and is the natural next milestone after P0.
3. **Watch R2 object-read costs** — batch reads and `have` negotiation are the two highest-leverage performance investments.
