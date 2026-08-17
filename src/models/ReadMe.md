# Models

This directory holds the **concrete models** of the starter: each file binds a
typia `SchemaModule` once, declaratively composes its capacities via
`defineModel`, and exports the finished model class. The actual behaviour lives
in the capacities (`../capacities/`); a model file is mostly *declaration* — the
schema, the bindings, and the capacity list.

> **Background:** [`docs/data-models-storage.md`](../docs/data-models-storage.md)
> is the narrative "what is a model?" overview. [`../capacities/ReadMe.md`](../capacities/ReadMe.md)
> maps the capacity system. **This file is a directory map** for the model files
> themselves.

---

## 1. Anatomy of a model file

Every model follows the same three-part shape (see `user.ts` for the canonical
example):

1. **Schema interface** (`UserSchema`, `RepositorySchema`, …) — a plain
   `interface` extending the type-level markers (`IdentifiableSchema`,
   `TimestampedSchema`, `Versionable`, `Hashable<"body">`) plus field constraints.
   typia reflects this interface directly (it is not a class).
2. **`*SchemaModule`** — the **fixed bundle** of every typia function the model
   needs (`schema`, `classify`/`assertClassify`, `clone`, `toJSON`/`fromJSON`,
   `encode`/`decode`, `equals`/`less`, `random`, …), bound **once, concretely**
   where the schema type is real. Handed to every capacity; each pulls its slice.
3. **`defineModel` call + `class`** — declares `schemaName` (the string a
   `Reference` tag targets), the `schemaModule`, and the `capacities` array. The
   model class adds only model-specific statics / domain methods.

`defineModel` (`base.ts`) folds the capacities (with `Triggerable` auto-first),
paves the model statics (`is`, `assert`, `validate`, `from`, `schemaName`),
registers the model under `schemaName` (so `Reference` tags resolve it), and runs
`wireInverseRelations()` to install auto-derived collection accessors.

---

## 2. Model inventory

| File | `schemaName` | Table | Notable capacities / fields | Relations declared here |
|---|---|---|---|---|
| `user.ts` | `UserSchema` | `users` | `Aggregable`, `Queriable` (`?mail=` alias), `Servable`, `Meterable`. | **None** — `getRepositories()` is auto-derived from `Repository.ownerId`'s `Reference` tag. |
| `repository.ts` | `RepositorySchema` | `repositories` | Git forge metadata catalog: owner, `defaultBranch`, `objectFormatName` (`'sha1'`/`'sha256'`), counters, `status`. | `ownerId → User` (`setNull`); inverse `user.getRepositories()` auto-derived. |
| `issue.ts` | `IssueSchema` | `issues` | Work items in a repo (Forgejo `Issue`): `repoId`/`posterId` FKs, `index`, `title`/`content`, `isClosed`/`isPull`, counters, unix timestamps. SQL-persisted subset only — derived relations (`labels`, `comments`, …) are omitted until those models land. | `repoId → Repository`, `posterId → User` (both `cascade`); inverses `repo.getIssues()` / `user.getIssues()` auto-derived. `milestoneId` kept as a plain nullable column. |
| `index.ts` | — | — | Re-exports `Issue, Repository, User` as namespaces. | — |
| `base.ts` | — | — | `defineModel` engine + `ModelBase` (constructor, `update`, `toValueObject`, `delete`). | — |

---

## 3. The relation graph (FK → target, `onDelete`, accessor)

All foreign keys are declared by the `Reference<>` tag (`../tags/reference.ts`);
`Referencible` reads the tag to build the owner accessor, and
`wireInverseRelations()` builds the inverse collection on the *target* model.

```
User  (UserSchema)
 └─ Repository.ownerId    → setNull (left)  →  user.getRepositories()

Repository (RepositorySchema)
 └─ Issue.repoId          → cascade (left)  →  repo.getIssues()

User  (UserSchema)
 └─ Issue.posterId        → cascade (left)  →  user.getIssues()
```

**`onDelete` is executed in memory** by `ModelBase.delete()` (see §4). `setNull`
(`Repository.ownerId`) is why that FK is nullable — nulling a required FK would be
rejected by `assertClassify`. The SQL FK constraint is emitted by
`SqlSerialisable` from the *same* tag, so the two cannot drift (the DDL action
clause is a known gap — see `docs/capacity-referencible.md` §9).

---

## 4. `delete()` semantics

`ModelBase.delete()` (in `base.ts`) is the in-memory delete:

1. **Idempotent** — tracked by a module-level `WeakSet` (frozen `Immutable`
   instances cannot hold a `__deleted` flag).
2. Fires the `onDelete` lifecycle hooks **before** deregistering — so cascade /
   setNull / restrict can still navigate from this instance.
3. Drops the instance from its identity map (`getInstanceMap(this).unregister`).

It is deliberately **not** a database operation. DB row removal is
`SqlSerialisable`'s `cascadeDelete` (driven by `Persistable` / the repository),
configured from the same `onDelete` vocabulary — same source of truth, different
machinery (see `docs/capacity-referencible.md` §9).

---

## 5. Supporting infrastructure (in `../`)

| Concern | File |
|---|---|
| Capacity engine (`composeCapabilities`, `REGISTRY`) | `../capacities/compose.ts` |
| `Reference` tag (FK source of truth) | `../tags/reference.ts` |
| Model registry (`registerModel`, name → class) | `../registry.ts` |
| Identity map (in-memory instance store `getX()` navigates) | `../storage/identity-map.ts` |
| Repository / persistence layer | `../storage/store.ts`, `../services/*` |
| Build artifacts (regenerable) | `../generated/models.json` (via `scripts/model-build.ts`), `../../drizzle/*.sql` (via `scripts/db-generate.ts`). Tests derive SQL plans at runtime, so they do **not** read these. |

---

## 6. Tests

| Test file | Covers |
|---|---|
| `base.test.ts` | `defineModel` constructor / `update` / `toValueObject`. |

Model persistence is covered by the service tests (`../services/repository.test.ts`);
per-capacity behaviour is covered by the sibling `*.test.ts` files in
`../capacities/`.

---

## 7. Where to go next

- **What is a model / how storage fits** → `docs/data-models-storage.md`.
- **Capacity mechanics** → `../capacities/ReadMe.md` + `docs/capacity-introduction.md`.
- **Relations & in-memory delete** → `docs/capacity-referencible.md` (esp. §9).
- **SQL projection** → `docs/capacity-sql-serialisable.md`.
