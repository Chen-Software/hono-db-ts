# Data Models & Storage

1. **What is a model here?** — the capacity-composition architecture.
2. **Where is data stored?** — the three cooperating layers.
3. **How do I query all LATEST posts from a user?**
4. **How do I query the HISTORY of a post?**

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

## 2. Storage has three cooperating layers

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

## 3. Query all LATEST posts from a user

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

## 4. Query the HISTORY of a post

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

## 5. Mental model, in one paragraph

| You want… | You call… | Returns |
|---|---|---|
| Latest version of each of a user's posts | `user.getPosts()` | one instance per id (latest) |
| The author of a post | `post.getUser()` | the author (identity-map FK resolve) |
| Every version of one post | `postRepo.historyOf(id)` | all `updated_at` snapshots, oldest → newest |
| Newest version from a history array | `Post.latestOf(history)` | the max-`updated_at` instance |
| Narrow a set (published, date range, substring) | `Post.filter(items, query)` | filtered array (schema-inferred matchers) |
| The same data at the SQL layer | `Post.table` + drizzle | real rows / `CREATE TABLE` |

Two posts → two `getPosts()` entries; one post edited twice → one `getPosts()`
entry (the latest) but a 3-version `historyOf(id)`.
