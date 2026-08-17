# SHA-256 Repo — Implementation Plan

> Companion to `docs/git-backend-impl-plans.md` and `docs/git-backend-review.md`. Turns the
> SHA-256-object-format decision (internal primary hash = SHA-256, SHA-1 kept only as a
> synthesized mirror) into a concrete, file-level, phase-gated implementation plan.
>
> **Status: DRAFT (2026-08-17).** No code written yet. Phases are ordered; each has a
> correctness gate. Phase 4 (packs & idx) is the critical path and largest risk.
>
> **Decisions locked:** SHA-256 internal primary format (`objectformat=sha256`, repo v1) ·
> SHA-1 synthesized mirror for ecosystem compat (pull / egress / ingress) · own fork of
> isomorphic-git on both ends · D1 `git_oid_map` with lazy SHA-1 · no new dependencies.

---

## 1. Context & rationale

- **git is going SHA-256** (NewHash, `objectformat=sha256` + `compatobjectformat`), and
  **Forgejo already supports SHA-256 repos** (since v7.0, April 2024). This project is a
  Forgejo-compatible port, so the primary store should match that direction.
- **Why SHA-256 and not BLAKE3 internally:** the only BLAKE3 advantage (pure-JS speed) is
  moot — `crypto.subtle.digest('SHA-256')` is native in Workers. SHA-256 buys a **double
  oracle** (real `git` validates both the primary path *and* the SHA-1 mirror), ecosystem
  alignment (git + Forgejo), and truthful wire/config metadata.
- **Why not real-git `--compat-object-format`:** it requires emulating git's still-stabilizing
  compat-idx and dual-hash wire negotiation. We only need compat for **our own clients**, so a
  synthesized SHA-1 view (objects rewritten on demand, indexed by a D1 map) is far lighter.
- **Hash-agnostic layers (untouched):** `src/git/fs-r2.ts` (path mapping only),
  `src/git/auth.ts`, `src/storage/store.ts` (generic `key → blob`).
- **No new dependencies:** `@noble/hashes` and `@better-auth/utils/hex` are already direct
  deps; SHA-256 itself comes from Web Crypto (`subtle.digest('SHA-256')`), native in Workers.

### Architecture at a glance

```
Your JS client (fork, SHA-256)
        │  object-format=sha256
Smart-HTTP transport (upload/receive, 64-hex)
        │
R2 object store (SHA-256 primary, 64-hex keys) ── D1 git_oid_map (sha256 ↔ sha1)
        │
SHA-1 synthesis shim (lazy rewrite) ── Virtual SHA-1 mirror
        │  push / ingest
External SHA-1 remotes (GitHub · CI)
```

---

## 2. Goals / Non-goals

**Goals**
- Store every git object keyed by **SHA-256** (`objects/<2>/<62>`, 64-hex refs, 32-byte pack
  oids + 32-byte pack checksum), as a real git `objectformat=sha256` bare repo.
- Server + client both speak SHA-256 natively over smart-HTTP (`object-format=sha256`).
- Provide a **virtual SHA-1 mirror** (pull, egress push, ingress) via a synthesized view so
  SHA-1-only tooling (stock `git`, CI, GitHub) still works.
- Self-verify every object on read/write (recompute SHA-256) — this is the integrity model.
- Keep the fork diff reviewable: one hash seam + one dual-width pack writer.

**Non-goals**
- No git-exact `compatobjectformat` / compat-idx emulation.
- No SHA-1 *primary* storage — SHA-1 exists only as a computed, cached mapping.
- No BLAKE3 anywhere in the git path (reserved for the non-git content store, if any).
- No attempt to make real git's SHA-1 client talk to the SHA-256 primary directly.

---

## 3. Phase 0 — Fork & hash seam (groundwork)

**Goal:** vendor the engine and establish the single hash seam, with correctness pinned.

**Files touched**
- `package.json` — pin `isomorphic-git@1.41.4` (exact); vendor its self-contained ESM build
  into `src/git/vendor/isomorphic-git/` (modified in-tree; keeps the Vite/Workers bundling
  intact). Keep a `VENDOR-README.md` with the upstream commit + diff log.
- `src/git/hash.ts` (new) — the **only** place that knows hashing:
  - `OID_BYTES = 32`, `OID_HEX = 64`, `ZERO_OID = "0".repeat(64)`.
  - `hashRaw(bytes)` → 32-byte SHA-256 via `crypto.subtle.digest("SHA-256", bytes)`.
  - `oidOf(type, body)` → `hashRaw("<type> <len>\0" + body)` (git object-header convention,
    only the hash function differs from SHA-1).
  - `hexOf(bytes)` via `@better-auth/utils/hex` (already used in `src/git/auth.ts`).
- `docs/sha256-object-format.md` (new) — the **spec**: object header convention, loose path,
  pack/idx layout deltas from git's SHA-1 format, ref/zero-oid width. This doc *is* the
  format contract since there is no upstream oracle for the combined shape.

**Key decisions**
- Hashing is Web Crypto native (Workers) — no pure-JS SHA-256 on the hot path.
- All downstream code imports from `hash.ts`; no literal `40` / `sha1` anywhere else.

**Acceptance**
- `hash.ts` unit tests cross-check `subtle` vs `@noble/hashes/sha256.js` on fixed vectors
  (incl. `oidOf("blob", …)` golden values).
- Vendor build imports cleanly under `bun test` and in the worker bundle.

**Risks:** vendoring a big bundle in-tree (size); keep the diff to the hash seam only.

---

## 4. Phase 1 — Engine hash swap (mechanical)

**Goal:** every byte hashed in the engine is now SHA-256; nothing else changes yet.

**Files touched**
- `src/git/vendor/isomorphic-git/` — replace every `shasum()` / `shasumSync()` call site and
  the **direct** `crypto.createHash("sha1")` pack-checksum site (`index.cjs:3553`, and any
  other direct `sha1` occurrences) with `hash.ts`.

**Key decisions**
- A grep-audit (pattern `sha1|createHash|shasum`) is the checklist; the acceptance gate is
  that zero `sha1` literals remain outside `docs/` and comments.

**Acceptance**
- `bun test` still green on the *existing* e2e suite only if those tests are SHA-256-clean —
  note: current e2e fixtures are SHA-1, so this phase **must** be landed together with the
  test-fixture migration in Phase 3 (see Risks).

**Risks:** a missed hash site = silent corruption; mitigated by the Phase 3 round-trip gate.

---

## 5. Phase 2 — OID width sweep (mechanical, grep-driven)

**Goal:** 64-hex everywhere; the engine and transport stop assuming 20-byte oids.

**Files touched**
- Vendored engine: oid regexes (`^[0-9a-f]{40}$` → `{64}`), 20-byte buffers → 32, loose path
  `objects/<2>/<38>` → `<2>/<62>`, tree entry parse/write (32-byte oid), commit/tag text
  (64-hex), `.git/index` stage entries (32-byte), refs (64-hex).
- `src/git/protocol.ts` — `ZERO_OID` (L18) becomes `ZERO_OID` from `hash.ts` (64-hex).
- Pack layer: oid entries 32 bytes, trailer 32 bytes (Phase 4 detail, width constant shared).
- The pack writer gains an `oidWidth` parameter (`32` native / `20` mirror) — **this single
  parameter is what makes Phase 6 cheap.**

**Key decisions**
- One shared constant (`OID_HEX`) — no magic numbers in the diff.

**Acceptance**
- grep-audit shows no `repeat(40)`, no `20`-byte oid buffer assumptions, no `{40}` regexes
  in `src/` or the vendored engine.

**Risks:** mechanical but wide; each miss is a latent bug — the Phase 3 gate catches them.

---

## 6. Phase 3 — Loose objects & self-consistency gate

**Goal:** loose object store at 64-hex with verification; the first executable slice.

**Files touched**
- Vendored engine loose-object read/write (already touched in Phase 2); `verifyObject`
  recomputes SHA-256 on read and compares to the oid.
- `src/git/git.e2e.test.ts` + new `src/git/sha256.e2e.test.ts` — migrate/add fixtures
  generated by **real git**: `git init --object-format=sha256`, commit blobs/trees/tags.
- Test fixture dir `test/fixtures/sha256-repos/` (git-generated, committed or generated at
  test time if `git` is available).

**Key decisions**
- `verifyObject` is **mandatory** on every read — it is the integrity guarantee.

**Acceptance**
- Property/round-trip tests: write random blobs/trees/commits → read → oid + bytes match;
  oid of a fixture object equals the oid real git computed for the same content.
- Existing SHA-1 e2e suite passes once fixtures are SHA-256 (the **first gate that proves
  the sweep is complete**).

**Risks:** fixtures require `git` ≥ 2.42 with SHA-256 on the dev machine — gate tests with a
skip if unavailable.

---

## 7. Phase 4 — Packs & idx v2 + dual-width writer (critical path)

**Goal:** pack read/write and idx v2 at 32-byte oids; the writer emits both widths.

**Files touched**
- Vendored engine pack parser/writer + idx v2 (indexPack / verifyPack paths):
  - pack trailer 32-byte SHA-256; REF_DELTA base oid 32 bytes (OFS_DELTA unchanged).
  - idx v2: oid table entries 32 bytes; pack-checksum + idx-checksum 32 bytes; fanout,
    CRC, offset tables structurally unchanged.
- `src/git/pack.ts` (new, or extracted from the vendor diff) — the **dual-width pack writer**:
  `writePack(objects, { oidWidth: 32 | 20, map?: (oid) => oid })` used by both the native
  path (width 32, no map) and the mirror (width 20, sha256→sha1 map).

**Key decisions**
- One writer, parameterized — never two pack implementations.
- Large/offset table handling identical to git's idx v2, only widths change.

**Acceptance**
- **Primary oracle:** for a real-git-generated SHA-256 repo, `writePack` output round-trips:
  our fork writes → real `git` (via `git index-pack` / clone from a file) accepts it; and
  real-git packs indexPack cleanly in our engine.
- Randomized object-graph push/clone cycles pass with oid identity preserved.

**Risks:** idx v2 offset/CRC subtlety (easy silent corruption) — the oracle is the antidote;
delta base resolution across widths must be exercised by the mirror tests.

---

## 8. Phase 5 — Wire & transport

**Goal:** smart-HTTP speaks `object-format=sha256` end to end; refs/zero-oid at 64-hex.

**Files touched**
- `src/git/upload.ts` / `src/git/receive.ts` — advertise and require the
  `object-format=sha256` capability on the v1 ref advertisement; parse 64-hex `want`/`have`;
  refuse sessions that don't negotiate it (both ends are ours).
- `src/git/refs.ts` — 64-hex ref advertisement (branches, tags, peeled tags per P0-3).
- `src/git/read.ts` / `src/git/backend.ts` / `src/git/routes.ts` — pass-through of 64-hex
  oids in pack/report-status paths; `ZERO_OID` from `hash.ts`.
- Repo config written on init: `repositoryFormatVersion=1` + `extensions.objectformat=sha256`
  (truthful metadata; stock git refuses to touch the repo unsafely — desired isolation).

**Key decisions**
- Capability is **required**, not optional: a SHA-1 client gets a clear `403/400` protocol
  error, never a silent mismatch.

**Acceptance**
- e2e: our fork client clones/pushes against our server at 64-hex; ref advertisement, pack
  transfer, and report-status all correct.

**Risks:** the fork's http client must also speak the capability — keep both sides in the
same vendored build to avoid drift.

---

## 9. Phase 6 — SHA-1 mirror (synthesis shim)

**Goal:** a virtual SHA-1 view of the SHA-256 store — pull, egress push, ingress.

**Files touched**
- Drizzle migration (`drizzle/`) + service (`src/services/oid-map.ts`): D1 table
  `git_oid_map(sha256 BLOB(32) PRIMARY KEY, sha1 BLOB(20) UNIQUE, created_at)`.
- `src/git/mirror.ts` (new) — the synthesis shim:
  - `sha1Of(sha256Oid)`: fetch object → parse (tree entries / commit-tag text / deltas) →
    rewrite oid refs to SHA-1 (recursively via the map) → lazily compute SHA-1 → cache in
    `git_oid_map`.
  - `rewriteObjectToSha1(obj)`: blobs unchanged (no refs); trees/commits/tags substituted.
  - `synthesizeSha1Pack(objects)`: dual-width writer at `oidWidth=20` with the map.
- `src/git/mirror-routes.ts` (new, or a capability on `routes.ts`): mirror endpoint advertises
  **SHA-1** and serves synthesized packs; refs mapped through the map.
- Egress: push path emits SHA-1 packs + mapped refs to external SHA-1 remotes.
- Ingress: receive SHA-1 objects → `oidOf(type, body)` → store under SHA-256 → record map.
- Cache: synthesized SHA-1 pack stored per (repo, head-set), e.g.
  `owner/repo.git/mirror-sha1/pack-<sha1>.pack`; invalidated on push.

**Key decisions**
- SHA-1 is computed **lazily** (first SHA-1-named request) — hot write path stays single-hash.
- The mirror is byte-valid SHA-1 git; if we later advertise git's real `compat` capability
  names, stock git could consume it — but that's out of scope.

**Acceptance — the real oracle for the whole system**
- `git clone` the mirror URL with **stock git CLI**; `git fsck` clean; tree diff vs the
  SHA-256 source matches; push to the mirror and pull back round-trips oid-consistently.

**Risks**
- Signed commits / annotated signed tags **don't verify in the SHA-1 view** (oid translation
  rewrites bytes; inherent, same as git's own compat) — document, don't fix.
- Cache staleness — invalidate synthesized packs on every push; test the invalidation path.
- Ingress auth/scope parity with P0-1 access-token rules.

---

## 10. Phase 7 — Cutover & data migration

**Goal:** existing SHA-1 data (if any) is migrated or deliberately dropped.

**Files touched**
- `scripts/migrate-sha1-to-sha256.ts` (new, one-time): list `objects/<2>/<38>` under each
  repo gitdir → read content → compute SHA-256 → write `objects/<2>/<62>` → insert
  `git_oid_map` → (optionally) tombstone/delete old keys. Re-pack path for existing packs.
- Wrangler/D1 migration for the `git_oid_map` table (same `drizzle/` migration as Phase 6).

**Key decisions**
- If no production SHA-1 data (likely at this stage): **clean cutover**, no migration script
  required — but still write the script doc/entry point for the future.
- Decide tombstone vs delete: prefer keeping a `sha1 → sha256` map entry for old oids so
  stale refs/clients can still resolve during a transition window.

**Acceptance**
- Post-cutover: all repos readable at 64-hex; mirror continues to serve; `git_oid_map`
  contains every migrated/derived oid pair.

**Risks:** migration job must be idempotent and resumable (R2 list cursor pagination).

---

## 11. Test strategy (oracles, in order of strength)

| Gate | What proves it | Phase |
|---|---|---|
| Golden hash cross-check | `subtle` vs `@noble/hashes/sha256` | 0 |
| Loose-object round-trip + real-git oid equality | sweep is complete, format correct | 3 |
| Pack oracle: our packs ↔ `git index-pack` / real-git packs | idx v2 / pack format correct | 4 |
| 64-hex e2e (our client ↔ our server) | wire & transport correct | 5 |
| **Mirror oracle: stock `git clone` + `git fsck` + tree diff** | the entire system is correct | 6 |

All SHA-256 fixtures generated by real `git` (`git init --object-format=sha256`); tests skip
gracefully if the dev `git` lacks SHA-256.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Pack idx v2 32-byte subtlety (offsets/CRC) | Pack oracle (Phase 4) + randomized graph tests |
| Missed SHA-1 hash/width site → silent corruption | Grep audits + `verifyObject` on every read + real-git oid equality |
| No upstream oracle for the combined format | `docs/sha256-object-format.md` spec + double oracle (primary + mirror) |
| Mirror cache staleness after push | Invalidate synthesized packs on push; test the invalidation path |
| Vendored-engine maintenance drift | Pin version; keep the diff to `hash.ts` seam + `oidWidth` |
| Signed objects don't verify in the mirror | Documented, accepted limitation |

---

## 13. Suggested commit order (small, reviewable)

1. Phase 0: vendor + `hash.ts` + `docs/sha256-object-format.md` + hash tests.
2. Phase 1: hash swap in the engine (diff is pure `shasum` → `hash.ts`).
3. Phase 2: width sweep (mechanical, one commit per subsystem: loose / tree / index / refs / pack).
4. Phase 3: loose store + `verifyObject` + SHA-256 fixtures; **existing e2e goes green**.
5. Phase 4: pack read/write + idx v2 + dual-width writer + pack oracle tests.
6. Phase 5: wire capability + 64-hex transport.
7. Phase 6: `git_oid_map` + synthesis shim + mirror endpoints + mirror oracle tests.
8. Phase 7: cutover/migration entry point + docs.

Estimated effort: **weeks**, dominated by Phases 2–4 (width sweep + packs + idx). Phases 6–7
are comparatively cheap because they reuse the dual-width writer and the map.

---

## 14. Open questions / deferred

- Keep old SHA-1 objects as tombstones vs delete after migration (decide in Phase 7, default tombstone).
- Mirror pack cache granularity (per head-set vs per ref) — start per-head-set.
- Whether the non-git content store (LFS-style) should adopt the same SHA-256 — out of scope here.
