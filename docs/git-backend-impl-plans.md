# Git Backend — Implementation Plans (address review discrepancies)

> Companion to `docs/git-backend-review.md`. Turns the gap analysis into concrete, file-level implementation plans grouped by milestone (P0 correctness → P1 v1 features → P2 parity/scale). Each plan lists: goal, files touched, key decisions, acceptance criteria, and risks.
>
> **Status: Milestone P0 is DONE (2026-08-17).** All 7 P0 items are implemented and covered by e2e tests in `src/git/git.e2e.test.ts` (P0-1…P0-7 each have a passing assertion).
>
> **Milestone P1 — ALL DONE (2026-08-17).** P1-1 `diff.ts` (diff/compare/rename/hunks), P1-2 `branches.ts` + `tags.ts` (CRUD/peel/containing), P1-3 `archive.ts` (dependency-free ZIP + TAR.GZ, Workers-safe), P1-4 `search.ts` (searchCommits/commitsForPath/aheadBehind), P1-5 `blame.ts` — all implemented with HTTP endpoints, covered by `p1-read.test.ts` + `p1-features.test.ts` + `phase1-check.test.ts`.
>
> **Milestone P2 — P2-1 first slice DONE (2026-08-17).** `src/git/objects.ts` provides a bounded-concurrency `batchReadObjects`; it is wired into the archive, diff, and blame read paths, collapsing the N-GET-per-object pattern into a single bounded-fan-out batch (8-way by default). The deeper pack-indexed backend (oid → (pack, offset, length) at `indexPack` time) remains as scoped in P2-1 below.

---

## Milestone P0 — correctness / "real git CLI works"

### P0-1 · Basic-auth + Personal Access Token for the git transport
**Goal:** `git clone`/`push` to a **private** repo from the real CLI works. Today the transport only reads better-auth **cookies** (`routes.ts` uses `getSession()`), but git CLI sends `Authorization: Basic` — so private repos are unreachable from the CLI.

**New DB model** (`src/models/` + drizzle migration in `drizzle/`):
- `access_tokens` table mirroring Forgejo `models/auth/access_token.go` (subset):
  - `id` (uuid), `user_id` FK, `name`, `token_sha256` (store **only** the SHA-256 of the raw token, never the raw token), `scopes` (JSON array, default `["read:repository","write:repository"]`), `last_used_at`, `expires_at` (nullable), `created_at`.
- Seed a token-generating service function: generate 40-hex raw token, return it once, persist only `token_sha256`.

**New file** `src/git/auth.ts` — a Basic-auth resolver for the transport:
- Parse `Authorization: Basic <b64>`, decode `user:pass`.
- If `pass` looks like a PAT (40-hex): SHA-256 it, look up `access_tokens`, check expiry + scope, return `{ user, type: "token", tokenId }`.
- Else: treat as password → attempt better-auth sign-in; if the user has 2FA enrolled, **reject** (Forgejo: "Users with two-factor authentication enabled cannot perform HTTP/HTTPS operations via plain username and password. Please create and use a personal access token"). On success return `{ user, type: "password" }`.
- Set `WWW-Authenticate: Basic realm="CodeForge"` on every 401.

**Edit** `src/git/routes.ts`:
- Replace the direct `getSession()` gates with a unified `resolveGitUser(c)` that tries cookie-session first, then Basic auth (PAT / password).
- Thread the resolved pusher into receive-pack; keep the existing owner-only push gate for now, generalize to a `canWrite(rec, user)` hook (so P2 teams/orgs can plug in).

**Acceptance:** `git clone https://user:TOKEN@host/owner/private.git` and `git push` both succeed from CLI; wrong token → 401 with `WWW-Authenticate`; 2FA user with password → 401; scope lacking write → 403.

**Risks:** token scopes need a model decision; better-auth sign-in path must share the same DB. Keep token lookup hash-only to avoid leaking secrets in logs/DB.

> **P0 implementation notes (2026-08-17).** Two deliberate deviations from the plan above:
> - **2FA rejection — CLOSED (2026-08-17).** The better-auth 2FA plugin (`better-auth/plugins`, v1.6.28) is now enabled in `src/auth/options.ts`, the `user.twoFactorEnabled` column + `twoFactor` table are in `src/auth/schema.ts` (and healed onto existing DBs by `ensureAuthSchema`), and `src/git/auth.ts` `resolvePassword` rejects any user with `twoFactorEnabled` set — the plugin refuses to mint a session for them, and the belt-and-braces `u.twoFactorEnabled` check double-guards. Covered by `src/auth/2fa.test.ts`. PAT (token) auth is unaffected and remains the recommended CLI path.
> - **Password verification uses `auth.api.signInEmail`** server-side (Better Auth's own verifier) rather than a direct hash compare — keeps us byte-compatible with better-auth's scrypt params without re-implementing them.
> - PATs are stored **only** as `token_sha256` (raw returned once at creation, never persisted or logged), per plan.

---

### P0-2 · Fix ref deletion (B2)
**Goal:** `git push --delete origin branch` / `git push origin :branch` actually deletes the ref.

**Edit** `src/git/receive.ts` (L91-95): for `newoid === ZERO_OID`, call `git.deleteRef({ fs, gitdir, ref: c.ref })` (isomorphic-git supports it). Only push `ok <ref>` to the report after a successful delete; on failure push `ng <ref> <msg>`. Emit a `repo.push` action with `deleted: true`.

**Edit** `src/git/routes.ts` queue block: stop skipping `ZERO_OID` commands — now deliver deletion events (needed for webhook delete/branch-deleted events).

**Acceptance:** e2e test asserting a pushed branch is removed and the ref no longer advertises; report-status shows `ok`.

**Risks:** none material; isomorphic-git `deleteRef` on a bare repo deletes the ref file.

---

### P0-3 · Advertise + pack tags (B3)
**Goal:** `git clone` brings tags; annotated tags are advertised peeled and packed.

**Edit** `src/git/refs.ts`:
- After branches, list tags via `git.listTags`. For each tag resolve its oid; if it's an annotated tag object (read object type via `readObject`), advertise `<tagOid> refs/tags/<name>` **plus** a peeled line `<commitOid> refs/tags/<name>^{}`.

**Edit** `src/git/upload.ts`:
- In `uploadPackService`, when the client negotiated `include-tag`, walk the tag objects whose target is reachable from the `want`s and add them to the pack set. Honor the `include-tag` capability (it's already advertised — currently ignored).
- Respect `ref-prefix`-style filtering if a v2 client requests tag prefixes (P2 covers full v2).

**Acceptance:** e2e: create an annotated tag, clone, assert tag exists and resolves to the commit; tags show in `git ls-remote`.

**Risks:** peeling requires reading tag objects (extra R2 GETs) — cache peeled results per advertisement; isomorphic-git `listTags` + `readObject` suffice.

---

### P0-4 · Enforce archived / mirror read-only (B4)
**Goal:** archived and mirror repos reject pushes (Forgejo semantics).

**Edit** `src/git/routes.ts` receive-pack handler: after resolving `rec`, if `rec.isArchived` → 403 `"This repo is archived. You can view files and clone it, but cannot push or open issues/pull-requests."`; if `rec.isMirror` → 403 `"mirror repository is read-only"`.

**Acceptance:** push to archived or mirror repo returns 403; clone still works.

**Risks:** none.

---

### P0-5 · Request body hardening + Content-Type validation (B5/B6)
**Goal:** no OOM/DoS from unbounded push bodies; protocol-correct 401 on bad Content-Type.

**Edit** `src/git/routes.ts` POST handlers:
- Before `c.req.arrayBuffer()`, check `Content-Length` header; if `> MAX_PUSH_BYTES` (configurable, default 500 MB) → 413.
- For workers without `Content-Length`, stream-read into a buffer with a hard cap (read chunks, abort past cap) instead of unbounded `arrayBuffer()`.
- Validate `content-type` header equals `application/x-git-<service>-request` (upload-pack / receive-pack); on mismatch → 401 (mirror Forgejo `serviceRPC`).

**Acceptance:** oversized push → 413; wrong Content-Type → 401; normal push unaffected.

**Risks:** streaming read adds complexity on R2; a size cap via `Content-Length` + a capped fallback reader is the pragmatic middle ground.

---

### P0-6 · Honor `have`s in upload-pack (B7)
**Goal:** `git fetch` of an existing clone transfers only the delta, not the whole graph every time (big bandwidth + R2 GET savings).

**Edit** `src/git/upload.ts` `uploadPackService`:
- Parse `have <oid>` lines (already read by `parsePktLines`; currently ignored).
- In `collectReachable`, add an `exclude`/`stop` set: stop the BFS walk at any oid that is reachable from a `have` (i.e., don't emit oids already known to the client). The classic implementation: mark `have`s and their ancestry as "known", then walk from `want`s and emit only objects not in the known set.
- Cache `resolveRef` results so repeated `have`s (clients send many) don't each trigger an R2 read.

**Acceptance:** e2e: push commit A, clone, push commit B, fetch → the pack for the fetch contains only B's new objects; assert pack size shrinks.

**Risks:** incorrect "known" pruning can corrupt fetches — the stop-set must include the full transitive ancestry of each `have`. This is the most subtle P0 item; keep the conservative version (stop only on exact `have` oids) as a safe first step.

---

### P0-7 · Lowercase repo-name normalization (B9)
**Edit** `src/git/routes.ts` `stripGit`: also `toLowerCase()` the repo name before resolving (Forgejo lowercases the URL path). Ensure repo-create already enforces lowercase (`REPO_NAME_PATTERN` does).

**Acceptance:** `Git/Repo.git` and `git/repo.git` resolve to the same repo.

---

## Milestone P1 — v1 forge features (read-side surface)

> **Status: P1 is DONE (2026-08-17).** All five items implemented and covered by tests:
> - P1-1 `src/git/diff.ts` (commit diff + compare + rename detection + hunks + size caps) — `src/git/p1-read.test.ts`.
> - P1-2 `src/git/branches.ts` (list/create/delete/rename/containing, paginated) + `src/git/tags.ts` (list/create lightweight+annotated/delete/peel) — `src/git/p1-read.test.ts`.
> - P1-3 `src/git/archive.ts` (dependency-free ZIP store + tar.gz via `CompressionStream`; `fflate` intentionally avoided to stay Workers-safe) — `src/git/p1-features.test.ts`.
> - P1-4 `src/git/search.ts` (`searchCommits` message/author/date filter, `commitsForPath` via `git.log` `includeChanges`, `aheadBehind`) — `src/git/p1-features.test.ts`.
> - P1-5 `src/git/blame.ts` (incremental line-tracking blame, no git CLI) — `src/git/p1-features.test.ts`.
> Endpoints for all five are mounted in `buildQueryApp`. Full git suite: 22/22 green (9 P0 + 4 P1-1/2 + 6 P1-3/4/5 + 3 phase1-check). Code search (`grep`) remains DEFERRED to P2 (needs P2-1 pack-indexed backend).

### P1-1 · Diff layer (`src/git/diff.ts`)
**Goal:** commit diff + two-ref compare + file diff, with rename detection and parsed hunks — unblocks the commit page and **PRs (v1)**.

- Port Forgejo `diff.go`/`diff_compare.go`/`repo_compare.go` semantics onto isomorphic-git:
  - `diffCommits(fs, gitdir, base, head)`: walk both trees, diff per path, detect adds/mods/deletes/renames.
  - `diffTree` with rename detection (`-M`: compare blob contents by hash).
  - `parseHunks` on unified-diff text (port `ParseDiffHunkString`).
- Endpoints: `GET /api/page/repositories/:id/commit/:oid/diff` and `GET /api/page/repositories/:id/compare?from=&to=`.

**Acceptance:** tree page shows per-file add/mod/del; commit page renders a diff; compare endpoint returns changed files + hunks.

**Risks:** rename detection + large-file diff is the heaviest part; cap file diff size (skip rendering diffs above a byte threshold, like Forgejo's `MaxFileSize`).

### P1-2 · Branch + tag services (`src/git/branches.ts`, `tags.ts`)
**Goal:** branch/tag CRUD and listings (branch UI, releases, PR base/target).

- Branches: `listBranches` (paginated, with latest commit date via `git.log` per branch), `createBranch`, `deleteBranch`, `renameBranch`; "branches containing commit" (`for-each-ref --contains` equivalent via isomorphic-git `listBranches` + ancestry check).
- Tags: `listTags`, `createTag` (lightweight + annotated), `deleteTag`, resolve annotated tag → commit (`readObject`).
- Service + endpoints mirroring `modules/git/repo_branch.go` / `repo_tag.go`.

**Acceptance:** create/list/delete branches & tags via API; branch/tag dropdowns populate on the UI.

### P1-3 · Archive download (`src/git/archive.ts`)
**Goal:** "Download ZIP / TAR.GZ" without a git CLI (isomorphic-git walk + readBlob + stream).
- Walk the tree at a ref, emit zip (`fflate` or `archiver`) / tar.gz entries with modes and symlink handling.
- Endpoint: `GET /api/repositories/:id/archive/:ref.{zip,tar.gz}` streaming (set `Content-Disposition`).

**Acceptance:** browser downloads a valid archive that unzips to the repo tree.

### P1-4 · Commit search + file history (`src/git/search.ts`)
**Goal:** commit search UI + file-history page.
- `searchCommits`: `git.log` with message keyword, author/committer, before/after (isomorphic-git log filters), paged.
- `commitsForPath`: `git.log({ filepath })` — the file-history page.
- `commitsBetween`/`commitsCountBetween`: for compare stats and PR ahead/behind.

**Acceptance:** commit search filters; a file's history page lists commits touching it.

### P1-5 · Blame (`src/git/blame.ts`)
**Goal:** per-line commit attribution on file view.
- Port Forgejo `blame.go` porcelain parsing: for each line, the commit that last touched it.
- isomorphic-git has no blame API — implement by walking `git.log` per file and, for each line, find the first commit whose blob matches at that line (line-tracking approach), or shell out to `git blame` when running in local dev / on a system with git.
- Batch across lines (single pass) rather than N `log` calls.

**Acceptance:** file view shows line → commit; e2e on a small file is deterministic.

**Risks:** correctness of line attribution without CLI; **recommend shelling out to `git blame` on the local-fs backend and shipping a JS fallback only for R2.**

> **Code search (`grep`) — explicitly DEFERRED from P1 to P2 (2026-08-17).** It was dropped from the P1 list (P1-1..P1-5) without a recorded decision. It is a search-index *subsystem* (tokenized, cross-repo, queryable), not a portable `git grep`; running grep over R2 would pull every blob per repo — exactly the N-GET problem P2-1 fixes. Land P2-1 (batch / pack-indexed reads) first, then build code search on top of the pack-indexed backend. Tracked under P2 feature work, not dropped.

---

## Milestone P2 — parity, scale, hardening

### P2-1 · Batch object reads over R2 (the architectural fix)
**Goal:** replace N-GET-per-object reads with a batch-aware access path (Forgejo's `cat-file --batch` / `pipeline/catfile.go` equivalent).
- Store a per-repo **pack index** object in R2 (oid → pack+offset) built at `indexPack` time; serve `readObject` by reading the single pack + index instead of N loose-object GETs.
- Cache ref resolutions (`resolveRef`) and tree listings per (ref) with invalidation on push.
- Add a small LRU in the Worker isolate for hot objects within a request.

**Acceptance:** clone/walk does ~1–3 R2 GETs per pack, not 1 per object; tree page is sub-100ms.

**Risks:** largest effort item; do not block P0/P1 on it. The `collectReachable` + `oidAtPath` call sites are the ones to instrument.

> **P2-1 redesign note (2026-08-17).** The naive "add Range support to `fs-r2.ts` `get()`" framing does **not** reduce R2 GET bytes. `get()` already downloads the whole object, and objects are stored loose (one git object → one R2 object), so a Range request still fetches the full object. The binding constraint is isomorphic-git's `FsClient`, which issues one GET per object. The real fix is the pack-index approach below: stop serving loose objects, store packs in R2, and serve via `(pack, idx)` using an `oid → (pack, offset, length)` map built at `indexPack` time. `fs-r2.ts` `get()` would then resolve the oid to a pack and issue a *ranged* GET against the pack blob — *that* is where Range requests pay off. Do not begin P2-1 until the read surface (P1) is in and the pack storage layout is settled.

### P2-2 · Object maintenance (repack / prune / gc)
**Goal:** prevent unbounded R2 growth from unreachable objects (every push leaves `indexPack`-only objects; deleted refs leak objects).
- Scheduled task (Cloudflare Cron + Queue): per repo, enumerate reachable objects from advertised refs, delete unreachable loose objects past a grace period (mirror Forgejo's repo-maintenance cron).
- Size accounting already exists (`r2MeasureSize` in `worker/d1.ts`); use it to drive `repositories.size`.

**Acceptance:** after force-deleting a ref, unreachable objects are removed by the maintenance job; `repositories.size` stays accurate.

### P2-3 · Ref-rule / branch-protection pre-receive (`src/git/rules.ts`)
**Goal:** per-ref authorization beyond "owner-only" — branch protection, force-push rules, protected tags (Forgejo `hook_pre_receive.go`).
- Add a `checkRefRules(rec, user, { ref, oldOid, newOid })` that consults a `protected_branches`/`protected_tags` table (new model) before `writeRef` in `receive.ts`.
- Block force-push on protected branches; block deletion of protected branches/tags; gate pushes to non-owner collaborators (when teams land) via `canWrite`.

**Acceptance:** pushing to a protected branch is rejected with a Forgejo-style message; force-push on protected branch rejected.

### P2-4 · Enrich push events + webhooks
**Goal:** webhook payloads need old oid (forced-push detection), branch-vs-tag, pusher email.
- Extend `repo.push` queue action to include `oldOid`, `newOid`, `refType` (branch/tag), `pusherEmail`, `forced` (computed when `oldOid` isn't an ancestor of `newOid`).
- Extend `src/services/webhooks.ts` + the queue consumer to build a GitHub-style push payload.

**Acceptance:** webhook receives complete push payload incl. forced flag; delete events delivered.

### P2-5 · Protocol parity (`git-upload-archive`, dumb HTTP, protocol v2, push options, gzip, push-to-create, wiki, `go-get=1`)
Progressive parity with `githttp.go`:
- **upload-archive**: stream `git archive` from a walk (reuse P1-3 archive builder).
- **Dumb HTTP**: GET `info/refs`, `objects/info/packs`, loose object, pack/idx file endpoints (mostly fs reads over R2/node).
- **Protocol v2**: honor `Git-Protocol: version=2` — `ref-prefix` filtering, `object-format=sha256`, `packfile-uris`; advertise `ls-refs`/`fetch`.
- **Push options**: accept `push-options` capability + pass to CI signals.
- **GZIP request bodies**: decode `Content-Encoding: gzip` before parsing pkt-lines.
- **Push-to-create**: create the repo row + bare repo on first push when absent (with cached dummy info/refs, Forgejo-style) behind a setting.
- **Wiki git**: `.wiki.git` namespace → wiki unit permission.
- **`go-get=1`**: meta tag for Go module proxy.

**Acceptance:** each adds one e2e/CLI test; keep behind feature flags where behavior is additive.

### P2-6 · SHA-256 repositories
Parameterize object length + `ZERO_OID` from `objectFormatName` (the seams are few: `protocol.ts` `ZERO_OID`, `receive.ts` regex, `upload.ts`). Serve sha256 repos per-row; advertise `object-format=sha256` in v2.

### P2-7 · GPG signatures, submodules, `.gitattributes`/LFS, notes, language stats, commit graph
- **Signatures**: parse `gpgsig` in commits, verify against stored public keys (Forgejo `object_signature.go`/`repo_gpg.go`).
- **Submodules**: read `.gitmodules`, resolve submodule tree entries.
- **LFS**: `pipeline/lfs.go` + `.gitattributes`-aware diff; LFS batch API (deferred per plan).
- **Language stats**: aggregate blob extensions per commit (Forgejo `repo_language_stats.go`).
- **Commit graph**: generate + serve `commit-graph` for faster traversal.

---

## Suggested sequencing

| Order | Item | Why now |
|---|---|---|
| 1 | P0-1 Basic auth + PAT | Unblocks CLI private clone/push — the core forge promise |
| 2 | P0-2/3/4 deletions, tags, archived/mirror | Small, correct, testable protocol fixes |
| 3 | P0-5/6/7 body cap, have-negotiation, case normalization | Robustness + fetch cost |
| 4 | P1-2 branch/tag, P1-1 diff | Foundation for PRs (v1) + branch/release UI |
| 5 | P1-3/4/5 archive, search, blame | Bread-and-butter forge read surface |
| 6 | P2-1 batch reads | The scaling fix; do once read surface is real |
| 7 | P2-2..P2-7 | Parity + hardening, as demand dictates |

---

## Cross-cutting risks & guardrails

- **R2 read cost** is the binding constraint: batch reads (P2-1) and `have`-negotiation (P0-6) are the two highest-leverage investments; cache ref/README/tree.
- **Never store raw PATs** — persist only `token_sha256`; log nothing.
- **Keep the e2e test** (`src/git/git.e2e.test.ts`) as the protocol contract: every P0 item gets an e2e/CLI assertion.
- **Stream, don't buffer** on Workers; add size caps before `arrayBuffer()`.
- **Progressive parity**: adopt P2-5 features behind flags; don't block P0/P1 on protocol v2 or LFS.
