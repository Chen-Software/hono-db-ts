# Data Models & Storage

1. **What is a model here?** — the capacity-composition architecture.
2. **The BBS models** — `Board`, `Thread`, `Reply` (and `Siftable` pagination).
3. **Where is data stored?** — the three cooperating layers.
4. **How do I query all LATEST posts from a user?**
5. **How do I query the HISTORY of a post?**

---

## 1. The model is a set of composable "capacities"

Every model (`User`, `Post`) is produced by `defineModel` (`src/models/base.ts`),
which takes a **reflected typia schema** plus a **fixed bundle of typia
functions** (the schema module), then folds a list of *capacities* onto it. A
capacity is a tiny mixin that owns ONE cross-cutting concern and contributes a
slice of the model's API — and every capacity is reusable across models.

### The `User` model

```ts
const UserModel = defineModel<UserSchema>({
  schemaName: "UserSchema",
  schemaModule: UserSchemaModule, // typia.json.schema + assertClassify + … bound ONCE
  capacities: [
    Identifiable,                 // uuid `id`
    Timestamped,                  // `created_at`
    JsonSerialisable,             // toJSON / fromJSON (+ JSON-override ctor)
    ProtobufEncodable,            // encode / decode / message
    { capacity: SqlSerialisable, options: { name: "users", dialect: "sqlite" } }, // drizzle table + row mappers
    { capacity: Validatable, options: { onNew: "assert", onUpdate: "assert" } },
    Clonable,
    Comparable,                   // equals / less / more
    { capacity: Referencible, options: { relations: [{ name: "posts", target: () => Post, by: "authorId", cardinality: "one-to-many", onDelete: "cascade" }] } }, // user.getPosts()
    Randomisable,                 // User.random()
    { capacity: Queriable, options: { fields: { email: { as: "mail" } } } }, // ?mail=
    { capacity: Meterable, options: { name: "User" } },
  ],
});
class User extends UserModel {}
```

**Schema fields:** `id: uuid`, `created_at`, `name`, `email` (format email),
`role: "admin" | "member" | "viewer"`, `age` (uint32, 19 < age ≤ 100).

### The `Post` model

```ts
const PostBase = defineModel<PostData>({
  schemaName: "PostData",
  schemaModule: PostSchemaModule, // typia.json.schema<PostData>() + the http DTO slice
  capacities: [
    Identifiable, Timestamped,
    JsonSerialisable, ProtobufEncodable, Clonable, Comparable,
    { capacity: SqlSerialisable, options: { name: "posts", dialect: "sqlite" } },
    { capacity: Referencible, options: { relations: [] } }, // getUser() is DERIVED from the FK tag
    Versionable,                  // immutable `update` + version toolkit
    Validatable,
    { capacity: Hashable, options: { key: "body" } },       // contentHash = SHA-256(body)
    Randomisable, Queriable,
    { capacity: Meterable, options: { name: "Post" } },
  ],
});
class Post extends PostBase {
  publish(): Post {
    if (this.published) throw new InvalidStateError("Post is already published");
    return this.update({ published: true });
  }
}
```

**Schema fields:** `id`, `created_at`, `updated_at` (doubles as the version),
`title`, `body`, `author` (nested `User`), `authorId` (FK → `User.id` via the
`Reference<"UserSchema","id","many-to-one","cascade","inner">` tag),
`contentHash` (SHA-256 of `body`), `published: boolean`.

> **Invariants live on the aggregate.** `publish()` throws `InvalidStateError`
> rather than letting a service silently no-op — the rule is testable with zero
> ports. `body` is `readonly`: content addressing requires you reconstruct
> (`update()`), never mutate.

---

## 2. The BBS models — Board, Thread, Reply

The same capacity system scales to a full bulletin-board graph with three more
models, each a ~30-line `defineModel` declaration reusing the existing
capacities. The relations are declared by `Reference` FK tags (owner side,
derived accessors) + manual inverse collections (the `Referencible` options).

### `Board` (版块)

```ts
const BoardModel = defineModel<BoardSchema>({
  schemaName: "BoardSchema",
  schemaModule: BoardSchemaModule,
  capacities: [
    Identifiable, Timestamped, JsonSerialisable, ProtobufEncodable,
    Clonable, Comparable,
    { capacity: SqlSerialisable, options: { name: "boards", dialect: "sqlite" } },
    { capacity: Referencible, options: { relations: [
        // inverse collection: FK `boardId` lives on `Thread`
        { name: "threads", target: () => "ThreadSchema", by: "boardId",
          cardinality: "one-to-many", onDelete: "cascade" },
    ] } },
    { capacity: Validatable, options: { onNew: "assert", onUpdate: "assert" } },
    Queriable,
    { capacity: Siftable, options: { sort: { field: "created_at", dir: "desc" } } },
    Randomisable, { capacity: Meterable, options: { name: "Board" } },
  ],
});
```

- `moderatorId: UUID & Reference<"UserSchema","id","many-to-one","setNull","inner","moderator">`
  — FK to `User`; the 6th type param names the derived accessor `getModerator()`.
- `getThreads()` — inverse collection (string target avoids a runtime cycle:
  `Thread` imports this module, so the thunk resolves by schema name via the
  registry instead of a class value).

### `Thread` (主题帖)

```ts
interface ThreadSchema extends IdentifiableSchema<UUID>, TimestampedSchema {
  updated_at: string & tags.Format<"date-time">; // last activity (bumped by touch())
  boardId:  UUID & Reference<"BoardSchema","id","many-to-one","cascade","inner">;
  authorId: UUID & Reference<"UserSchema","id","many-to-one","cascade","inner","author">;
  title: string & tags.MinLength<1> & tags.MaxLength<300>;
  pinned: boolean;
  locked: boolean;
}
```

- MUTABLE (unlike `Post`'s content-addressed immutability): title edits,
  pinning, locking are in-place state changes; `updated_at` means "last
  activity" and is bumped by `touch()`.
- Aggregate invariants on the class: `pin()`/`unpin()`/`lock()`/`unlock()`
  throw `InvalidThreadStateError` on illegal transitions (e.g. double-pin).
- `getBoard()` / `getAuthor()` derived from the FK tags; `getReplies()`
  inverse collection (FK `threadId` lives on `Reply`).

### `Reply` (回帖)

```ts
interface ReplySchema extends IdentifiableSchema<UUID>, TimestampedSchema {
  threadId: UUID & Reference<"ThreadSchema","id","many-to-one","cascade","inner">;
  authorId: UUID & Reference<"UserSchema","id","many-to-one","cascade","inner","author">;
  parentId?: UUID & Reference<"ReplySchema","id","many-to-one","cascade","left","parent">;
  body: string & tags.MinLength<1> & tags.MaxLength<20000>;
}
```

- **Self-referencing FK** (`parentId` → `Reply`): supports nested threading.
  `parentId` is optional — top-level replies omit it.
- `getParent()` derived from the tag (owner side); `getChildren()` is a manual
  inverse collection using a predicate (`candidate.parentId === self.id`).
- The SQL projection correctly derives `parentId` as a **nullable** column with
  a self-`FOREIGN KEY` (the `sql-serialisable` nullability inference treats
  fields absent from the schema's `required` list as nullable).

### `Siftable` — cursor pagination

`Queriable.filter` returns the WHOLE matching set; BBS list endpoints need
stable paging. `Siftable` adds `static sift(items, query?, cursorOpts?)`:

```ts
const page1 = Thread.sift(board.getThreads(), {}, { limit: 20 });
// { rows: Thread[], nextCursor: "2026-08-05T…" }

const page2 = Thread.sift(board.getThreads(), {}, { limit: 20, cursor: page1.nextCursor });
```

Keyset (cursor) semantics: filter (same query shape as `Queriable`) → order by
a sort key (default `updated_at` desc) → resume strictly past the cursor.
Cursor is the sort-key value of the last item, so it is opaque yet sufficient
to resume; `nextCursor` is `null` on the last page.

### `Servable` — generated SQL-backed HTTP routes

`Siftable` paginates in memory; the SQL server (`scripts/serve.ts`) hand-writes
join-heavy read models. `Servable` closes the gap: it turns any
`SqlSerialisable` model into a Hono app with **generated read routes** —
`Model.serve(app, client)` registers `GET /<table>` + `GET /<table>/:id`, and
`Model.routeSpec()` introspects what a route accepts:

```ts
import { Hono } from "hono";

const app = new Hono();
Board.serve(app, client);   // GET /boards, GET /boards/:id
Thread.serve(app, client);  // GET /threads, GET /threads/:id
User.serve(app, client);    // GET /users, GET /users/:id

app.get("/boards/:id/hot", /* explicit multi-model read model stays hand-written */);
```

It reuses the two sources the rest of the architecture already derives from the
schema — no per-model SQL:

- **`SqlSerialisable`** — the derived drizzle `table` (name + columns), the
  column kinds and the primary key, plus the `fromRow` mapper (so booleans /
  JSON come back as domain values, not storage encodings).
- **`Queriable`** — the exported `deriveFieldPlans` matcher table, so a
  `?param=` means the SAME thing over SQL as it does in-memory: boolean →
  exact, number → exact + `[min,max]` range, date → day-level range
  (`[2026-01-01,2026-12-31]`), string/uuid → substring, array → "contains all".

List semantics mirror `Siftable`: `?limit=` (clamped to `[1, maxLimit]`) and
`?cursor=` keyset pagination, ordered by a configured sort key (default
`updated_at` desc, falling back to `created_at` then the PK), with a
`nextCursor` in the response. Like `Queriable`, it is **permissive** — unknown
params and empty values are ignored, never 400. Composition order matters:
`SqlSerialisable` must be declared before `Servable` (it lifts `table` /
`fromRow`).

> **Scope is deliberately read-only per model.** `Servable` generates the two
> generic CRUD-ish read routes only. The join-heavy "good BBS queries"
> (`/boards/:id/hot`, `/threads/:id` with author+count, `/search`) are
> multi-model read models — they stay as explicit handlers. `Servable` is the
> per-model surface; the wire shape it emits (`{ ok, data }`) matches the
> hand-written server and `LocalTransport`.

### `Aggregable` — generated SQL-backed aggregation

`Servable`/`Queriable` answer "which ROWS match"; `Aggregable` answers "what the
matching rows ADD UP to". It turns any `SqlSerialisable` model into an
aggregateable entity — `GROUP BY` + `COUNT`/`SUM`/`AVG`/`MIN`/`MAX` — through
the same query-param surface:

```ts
const rows = Post.aggregate(allPosts, {
  groupBy: "authorId", count: "*", published: "true", orderBy: "count:desc",
});
// [{ authorId: "u1", count: 3 }, …]  — most posters first

Post.serveAggregate(app, client);   // GET /posts/aggregate
```

Query params (all optional, PERMISSIVE like `Queriable` — never 400):

| param | meaning |
|---|---|
| `groupBy` | comma-separated fields to group by (omitted → one whole-set row) |
| `count` | `*` → `COUNT(*)` (alias `count`); `count=field` → `COUNT(field)` |
| `sum`/`avg`/`min`/`max` | comma-separated numeric fields → `sum_age`, `avg_age`, … |
| any other field | a `Queriable`-style row filter applied BEFORE grouping (same `buildFilters` SQL) |
| `orderBy` | `<alias>[:asc\|desc]` (group field or aggregate alias); default: first `groupBy` field asc |
| `limit` | cap group rows (default 25, max 100) |

The answer to "which users posted the most throughout history":

```
GET /posts/aggregate?groupBy=authorId&count=*&orderBy=count:desc&limit=10
```

> Two aggregate surfaces exist for the same question: the hand-written
> `/stats/top-posters` (rich read-model: LEFT JOINs `users` so it returns
> `name`/`email`/`role` and includes zero-post users) and the generic
> `GET /<table>/aggregate` (single-table, per-author `authorId` + count only).
> The latter is the capacity; the former is the join-heavy read model — both
> count the *current* `posts` rows (one per post id), NOT edit history (that
> lives in the append-only version store, see §5).

---

## 3. Storage has three cooperating layers

| Layer | File | Holds | Used for |
|---|---|---|---|
| **Identity map** | `src/storage/identity-map.ts` | `Map<(modelName, id) -> instance>` | FK navigation + collection scans (in-memory, no round-trip) |
| **Store** | `src/storage/store.ts` | uniform `key -> blob` async I/O | `Persistable` ships model bytes; swap backends behind one interface |
| **SQL projection** | `src/capacities/sql-serialisable.ts` | derived drizzle table + `toRow`/`fromRow` | `db-generate`/`db-migrate` → real `CREATE TABLE`; `db.select().from(Post.table)` |

**The one idea that answers both query questions** — there are TWO different
"post collections", and knowing which you want is everything:

- the **identity map** holds **ONE instance per post id** (the *latest* one it
  saw — each construction re-registers and overwrites by `(model, id)`). This
  powers `user.getPosts()` and returns the **current/latest** versions;
- the **version history** holds **EVERY version** of a post (all `updated_at`
  snapshots sharing the same `id`) — append-only, owned by infrastructure (the
  repository / version-history store), **NOT** the identity map.

> Because `SqlSerialisable` derives the actual drizzle `posts` table from the
> reflected schema (including the `authorId` FK from the `Reference` tag), the
> SQL layer is generated, not hand-written. `db-generate`/`db-migrate` turn it
> into real `CREATE TABLE` SQL (sqlite or pg).

---

## 4. Query all LATEST posts from a user

Use the `Referencible` inverse relation `user.getPosts()` plus the fact that the
identity map already keeps the latest instance per id:

```ts
import { User } from "../src/models/user";

// Scans the identity map for every Post whose authorId === user.id.
// Because the map keeps only ONE instance per post id (the most recently
// registered — i.e. the latest version), this already returns the LATEST
// version of each of the user's posts, one per id.
const latestPosts = user.getPosts();
```

If instead you have a mixed array that may contain multiple versions of the same
post, collapse to the latest per id with the `Versionable` helpers:

```ts
import { Post } from "../src/models/post";

// 1. keep only this user's posts (any shape, possibly with duplicates):
const byAuthor = Post.filter(allPosts, { authorId: user.id });

// 2. dedupe to one per id, keeping the newest updated_at:
const byId = new Map<string, Post>();
for (const p of byAuthor) {
  const cur = byId.get(p.id);
  if (!cur || p.isNewerThan(cur)) byId.set(p.id, p);
}
const latestPosts = [...byId.values()];
```

`Queriable` infers matchers from the reflected schema — boolean → exact,
date → range with `[min,max]`, string/uuid → substring — so narrowing is free:

```ts
const published = Post.filter(latestPosts, { published: "true" });
const recent    = Post.filter(latestPosts, { updated_at: "[2026-01-01,2026-12-31]" });
```

**SQL equivalent** — the derived drizzle table, at the DB layer:

```ts
import { eq } from "drizzle-orm";
const posts = await db.select().from(Post.table).where(eq(Post.table.authorId, user.id));
```

---

## 5. Query the HISTORY of a post

The identity map does **not** keep old versions — it overwrites by id. The full,
append-only history of a post lives in the version-history store (the
repository's `historyOf(postId)`), which returns every `updated_at` snapshot for
that id, oldest → newest. `Versionable` gives you the tools to reason about it:

```ts
import { Post } from "../src/models/post";

// every version of this post, oldest → newest (from the repo / history store)
const history: Post[] = await postRepo.historyOf(post.id);

const newest = Post.latestOf(history);        // max updated_at (order-independent)
const oldest = history[0];                    // the first snapshot = the original

history[2].isNewerThan(history[1]);           // true
Post.compareVersions(history[1], history[2]); // -1
```

`Versionable`'s `update` is **immutable**: it reconstructs a brand-new instance
with a strictly-later `updated_at`, so appending that result to the history store
yields the next version. The history is literally the sequence of writes your
app produced:

```ts
const v3 = newest.update({ body: "edited again" }); // NEW instance, later updated_at
await postRepo.append(v3);                          // history now = [..., v2, v3]
```

To fetch the **current** version of a single post by id, that is the identity
map / `findById` (the latest registered):

```ts
const current = postRepo.findById(post.id);
```

---

## 6. Mental model, in one paragraph

| You want… | You call… | Returns |
|---|---|---|
| Latest version of each of a user's posts | `user.getPosts()` | one instance per id (latest) |
| The author of a post | `post.getUser()` | the author (identity-map FK resolve) |
| Every version of one post | `postRepo.historyOf(id)` | all `updated_at` snapshots, oldest → newest |
| Newest version from a history array | `Post.latestOf(history)` | the max-`updated_at` instance |
| Narrow a set (published, date range, substring) | `Post.filter(items, query)` | filtered array (schema-inferred matchers) |
| The same data at the SQL layer | `Post.table` + drizzle | real rows / `CREATE TABLE` |
| The same filters over HTTP | `Board.serve(app, client)` | `GET /boards` (+ `/:id`), generated SQL routes |

Two posts → two `getPosts()` entries; one post edited twice → one `getPosts()`
entry (the latest) but a 3-version `historyOf(id)`.

---

## 7. See also — the capacity system

For the *mechanism* behind the capacity list (how `composeCapabilities` folds
capacities, `Triggerable` always-first, the `SchemaModule` slice model, marker
vs. behavioural capacities, the type-level fold), see
[`capacity-introduction.md`](./capacity-introduction.md) — the index to the
per-capacity docs below:

- Identity & provenance: [`Identifiable`](./capacity-identifiable.md), `Timestamped`, `Referencible`
- Validation & schema: [`Validatable`](./capacity-validatable.md), `SchemaModule`
- Storage & wire format: [`SqlSerialisable`](./capacity-sql-serialisable.md), [`JsonSerialisable`](./capacity-json-serialisable.md), [`ProtobufEncodable`](./capacity-protobuf-encodable.md), `Persistable`
- Versioning & immutability: [`Versionable`](./capacity-versionable.md), [`Immutable`](./capacity-immutable.md), [`Hashable`](./capacity-hashable.md)
- Query & serve: [`Queriable`](./capacity-queriable.md), `Siftable`, [`Servable`](./capacity-servable.md), `Aggregable`
- Behaviour & utilities: [`Clonable`](./capacity-clonable.md), `Comparable`, `Randomisable`, `Derivable`, `Reactive`, `Meterable`
