import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { LocalD1Database } from "../src/providers/d1-client";
import {
	UserSchemaModule,
	type UserSchema,
} from "../src/models/user";
import { StoreProvider } from "../src/providers/store-provider";
import { BlobBackend } from "../src/providers/blob-backend";
import { SqlBackend } from "../src/providers/sql-backend";
import {
	LocalObjectStoreClient,
	ObjectStoreProvider,
} from "../src/providers/object-store";
import { FsProvider } from "../src/providers/fs-provider";
import { DbProvider, MemoryDbClient } from "../src/providers/db-provider";
import { UserRepo } from "../src/repository/user-repo";
import { UserService } from "../src/application/user-service";
import { InMemoryBus } from "../src/services/event-bus";
import { userServiceApp } from "../src/transport/user-controller";

function assert(cond: unknown, msg: string): asserts cond {
	if (!cond) throw new Error("ASSERT FAILED: " + msg);
}

/**
 * drizzle does not auto-create DDL, so the table must exist before the
 * `SqlBackend` talks to it. In a real app this is a migration step; here we
 * create the `users` table once per db. The DDL uses only types valid in both
 * SQLite and Postgres (TEXT / INTEGER), so the SAME `SqlBackend` can target a
 * remote Postgres driver in production with zero changes. We run it on the
 * RAW client (`bun:sqlite` `Database.run`) because the drizzle wrapper
 * exposes no generic `execute`.
 */
const USERS_DDL = `CREATE TABLE IF NOT EXISTS users (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	email TEXT NOT NULL,
	role TEXT NOT NULL,
	age INTEGER NOT NULL,
	created_at TEXT NOT NULL
)`;

const NS = "users";
const tmp = mkdtempSync(join(tmpdir(), "store-smoke-"));
const sample = {
	name: "Ada Lovelace",
	email: "ada@example.com",
	role: "admin" as const,
	age: 36,
};

// 1a. BLOB backends — the UNIFORM object-store shape ------------------------
// object store (S3-like) / fs / db-as-blob all go through BlobBackend, the
// SAME StoreProvider code, keyed <namespace>/<uuid>.
const blobBackends: Array<[string, any]> = [
	["object", new ObjectStoreProvider(new LocalObjectStoreClient(join(tmp, "object")))],
	["fs", new FsProvider(join(tmp, "fs"))],
	["db-as-blob", new DbProvider(new MemoryDbClient())],
];
for (const [label, blob] of blobBackends) {
	const sp = new StoreProvider<UserSchema>({
		schema: UserSchemaModule,
		namespace: NS,
		backend: new BlobBackend(blob, UserSchemaModule),
	});
	const { id, entity } = await sp.insert(sample);
	assert(id && entity.id === id, `${label}: insert keys id`);
	assert(typeof entity.created_at === "string", `${label}: created_at assigned`);
	const loaded = await sp.load(id);
	assert(loaded && loaded.name === "Ada Lovelace", `${label}: load round-trip`);
	assert(loaded && loaded.email === "ada@example.com", `${label}: load email`);
	const all = await sp.find();
	assert(all.length === 1, `${label}: find`);
	const byRole = await sp.find({ where: { role: "admin" } });
	assert(byRole.length === 1, `${label}: filtered find (where)`);
}

// 1b. SQL backend — LOCAL driver (bun:sqlite) -------------------------------
// Same StoreProvider; BlobBackend swapped for SqlBackend. Real columns, real WHERE.
{
	const sqliteClient = new Database(join(tmp, "local.sqlite"));
	await sqliteClient.run(USERS_DDL);
	const sqlite = drizzle(sqliteClient);
	const sp = new StoreProvider<UserSchema>({
		schema: UserSchemaModule,
		namespace: NS,
		// The table + mappers are the model's DERIVED `sql` projection — the
		// `SqlSerialisable` capacity built them from the reflected UserSchema.
		backend: new SqlBackend(sqlite, UserSchemaModule.sql!),
	});
	const { id } = await sp.insert(sample);
	const loaded = await sp.load(id);
	assert(loaded && loaded.email === "ada@example.com", "sqlite: load round-trip");
	assert(loaded && loaded.age === 36, "sqlite: age column typed (number)");
	// structured operator compiled to a real SQL predicate
	const adults = await sp.find({ query: { age: { op: "gte", value: 30 } } });
	assert(adults.length === 1, "sqlite: query op -> WHERE (age >= 30)");
	await sp.update(id, { name: "Ada L." });
	const renamed = await sp.load(id);
	assert(renamed && renamed.name === "Ada L.", "sqlite: column update");
	await sp.delete(id);
	assert((await sp.load(id)) === undefined, "sqlite: delete");
}

// 1c. Cloudflare D1 — the SAME derived `sql` projection, driven through the
// real D1 driver (`drizzle-orm/d1`) backed by a LOCAL D1 emulation over
// bun:sqlite. In production, swap `new LocalD1Database(...)` for the `D1Database`
// binding and nothing else moves — D1 is SQLite dialect.
{
	const d1 = new LocalD1Database(join(tmp, "d1.sqlite"));
	await d1.exec(USERS_DDL);
	// cast at the adapter boundary: drizzle-orm/d1 types the client as the
	// miniflare `D1Database` class; ours is the same API subset, see d1-client.ts
	const d1Db = drizzleD1(d1 as any, { logger: true });
	const sp = new StoreProvider<UserSchema>({
		schema: UserSchemaModule,
		namespace: NS,
		backend: new SqlBackend(d1Db, UserSchemaModule.sql!),
	});
	const { id } = await sp.insert(sample);
	const loaded = await sp.load(id);
	assert(loaded && loaded.email === "ada@example.com", "d1: load round-trip");
	assert(loaded && loaded.age === 36, "d1: age column typed (number)");
	const adults = await sp.find({ query: { age: { op: "gte", value: 30 } } });
	assert(adults.length === 1, "d1: query op -> WHERE (age >= 30)");
	await sp.update(id, { name: "Ada D." });
	assert((await sp.load(id))?.name === "Ada D.", "d1: column update");
	await sp.delete(id);
	assert((await sp.load(id)) === undefined, "d1: delete");
	console.log("  d1 (local emulation over bun:sqlite) OK");
}

// 1d. Postgres REMOTE driver — NOT run here (would need a real server / the
// removed `@electric-sql/pglite`). The same `SqlBackend` targets it unchanged:
// swap the driver + use `UserRepo.overSql("users", pgDb, "pg")` (reads the
// model's DERIVED `sqlPg` projection) and nothing else moves.

// 2. UserRepo + UserService over the LOCAL sqlite backend -------------------
const bus = new InMemoryBus("smoke");
const svcClient = new Database(join(tmp, "svc.sqlite"));
await svcClient.run(USERS_DDL);
const svcDb = drizzle(svcClient);
const repo = UserRepo.overSql("users", svcDb, "sqlite");
const svc = new UserService({ repo, bus });

const created = await svc.createUser(sample);
assert(!!created.id, "service.createUser assigns id");
const got = await svc.getUser(created.id);
assert(got && got.email === "ada@example.com", "service.getUser");
await svc.createUser({ name: "Bob", email: "bob@example.com", role: "member", age: 40 });
const listed = await svc.listUsers();
assert(listed.length === 2, "service.listUsers");
// the role use case round-trips through the port -> StoreProvider -> SqlBackend -> WHERE
const admins = await svc.listUsersByRole("admin");
assert(admins.length === 1, "service.listUsersByRole(admin) -> WHERE");
await svc.deleteUser(created.id);
assert((await svc.getUser(created.id)) === undefined, "service.deleteUser");

// events published through the bus provider
let createdEvents = 0;
bus.subscribe("user.created", () => {
	createdEvents++;
});
await svc.createUser({ name: "Cleo", email: "cleo@example.com", role: "viewer", age: 30 });
assert(createdEvents === 1, "bus published user.created");

// 2b. The same UserRepo + UserService over D1 (overD1 factory) — the port
// boundary means swapping bun:sqlite → D1 changes ZERO service code.
{
	const d1 = new LocalD1Database(join(tmp, "svc-d1.sqlite"));
	await d1.exec(USERS_DDL);
	const d1Repo = UserRepo.overD1("users", drizzleD1(d1 as any));
	const d1Svc = new UserService({ repo: d1Repo, bus });
	const createdD1 = await d1Svc.createUser(sample);
	assert(!!createdD1.id, "d1 service.createUser assigns id");
	const gotD1 = await d1Svc.getUser(createdD1.id);
	assert(gotD1 && gotD1.email === "ada@example.com", "d1 service.getUser");
	const adminsD1 = await d1Svc.listUsersByRole("admin");
	assert(adminsD1.length === 1, "d1 service.listUsersByRole(admin) -> WHERE");
	await d1Svc.deleteUser(createdD1.id);
	assert((await d1Svc.getUser(createdD1.id)) === undefined, "d1 service.deleteUser");
	console.log("  d1 UserService (overD1) OK");
}

// 3. Hono REST adapter (in-memory request — no listening socket) ------------
const app = userServiceApp(svc);
const res = await app.request("/", {
	method: "POST",
	body: JSON.stringify({ name: "Dora", email: "dora@example.com", role: "viewer", age: 30 }),
});
assert(res.status === 201, "hono POST 201");
const body = (await res.json()) as any;
assert(body.id && body.name === "Dora", "hono POST returns user");

const getRes = await app.request(`/${body.id}`);
assert(
	getRes.status === 200 && ((await getRes.json()) as any).name === "Dora",
	"hono GET by id",
);

const bad = await app.request("/", {
	method: "POST",
	body: JSON.stringify({ name: "", email: "x", role: "admin", age: 5 }),
});
assert(bad.status === 422, "hono rejects invalid (422)");

console.log("ALL SMOKE TESTS PASSED");
