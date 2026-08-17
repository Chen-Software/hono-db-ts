import { test, expect } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { ensureSchema } from "../http/schema";
// Import the models BEFORE the services: `defineModel` → `SqlSerialisable`
// derives + registers the `UserSchema` / `RepositorySchema` drizzle tables in
// `tableRegistry`, and the services resolve them via a thunk at module load.
// If a service import runs first, `resolveTableThunk` throws ("never derived").
import "../models/user";
import "../models/repository";
import * as repo from "./repository";
import * as users from "./users";
import type { Db } from "./types";

/**
 * End-to-end regression test for the repository service against a real
 * in-memory libSQL database (the same backend the app uses via
 * `createQueryDb`). This catches runtime-only bugs that the type-check / UI
 * build cannot — e.g. an undefined `now`, a snake_case column name in the
 * keyset cursor, or an ambiguous unqualified `id` in the joined `listIndex`
 * query. Those all slipped past `ui:build` because the Honox frontend does not
 * compile the service layer.
 */
function makeDb() {
	const client = createClient({ url: ":memory:" });
	const adapter = {
		async unsafe(sql: string, params?: unknown[]) {
			const res = await client.execute({ sql, args: params ?? [] });
			return (res.rows ?? []) as unknown[];
		},
	};
	return { client, db: drizzle({ client }) as Db, adapter };
}

test("repository service: create/read/listByOwner/update + keyset cursor + ON DELETE SET NULL", async () => {
	const { client, db, adapter } = makeDb();
	await ensureSchema(adapter as any);

	// A real user so the ownerId FK is legitimate (libSQL enforces FKs).
	await client.execute({
		sql: `INSERT INTO "users" ("id","created_at","name","email","role","age") VALUES (?,?,?,?,?,?)`,
		args: ["u1", new Date().toISOString(), "Test User", "t@example.com", "member", 30],
	});

	const id1 = await repo.create(db, {
		ownerId: "u1",
		name: "my-repo",
		lowerName: "my-repo",
		description: "first",
		isPrivate: false,
	});
	expect(id1).toBeTruthy();
	const id2 = await repo.create(db, {
		ownerId: "u1",
		name: "other-repo",
		lowerName: "other-repo",
		description: "second",
		isPrivate: true,
	});

	const page = await repo.getPage(db, id1);
	expect(page.repository.name).toBe("my-repo");
	expect(page.owner?.name).toBe("Test User");
	expect(page.repository.numStars).toBe(0);

	const idx = await repo.listIndex(db);
	expect(idx.total).toBe(2);
	expect(idx.repositories.length).toBe(2);
	expect(idx.nextCursor).toBe(null); // 2 < PAGE.repositoriesIndex (24)

	const owner = await repo.listByOwner(db, "u1");
	expect(owner.length).toBe(2);

	await repo.update(db, id1, { name: "renamed", description: "updated" });
	const after = await repo.getPage(db, id1);
	expect(after.repository.name).toBe("renamed");
	expect(after.repository.description).toBe("updated");

	// The keyset cursor WHERE branch must execute without an ambiguous-column
	// error (regression: `id` used to be unqualified in the joined query).
	const cur = await repo.listIndex(db, `0:${id1}`);
	expect(Array.isArray(cur.repositories)).toBe(true);

	// `ownerId` is declared `onDelete: setNull` — deleting the owner nulls it.
	await client.execute({ sql: `DELETE FROM "users" WHERE "id" = ?`, args: ["u1"] });
	const afterDelete = await repo.getPage(db, id1);
	expect(afterDelete.repository.ownerId).toBe(null);
});

test("repository service: create enforces name grammar + (owner, name) uniqueness; git route resolves owner login", async () => {
	const { client, db, adapter } = makeDb();
	await ensureSchema(adapter as any);

	const insertUser = (id: string, name: string) =>
		client.execute({
			sql: `INSERT INTO "users" ("id","created_at","name","email","role","age") VALUES (?,?,?,?,?,?)`,
			args: [id, new Date().toISOString(), name, `${id}@example.com`, "member", 30],
		});
	await insertUser("u9", "octocat");
	await insertUser("u10", "other-user");

	const id = await repo.create(db, {
		ownerId: "u9",
		name: "hello-world",
		lowerName: "hello-world",
		description: "hi",
	});
	expect(id).toBeTruthy();

	// Duplicate (ownerId, lowerName) is rejected.
	await expect(
		repo.create(db, { ownerId: "u9", name: "Hello World", lowerName: "hello-world", description: "" }),
	).rejects.toBeInstanceOf(repo.DuplicateRepositoryError);

	// The SAME name under a DIFFERENT owner is fine (the uniqueness is per owner).
	const otherId = await repo.create(db, {
		ownerId: "u10",
		name: "hello-world",
		lowerName: "hello-world",
		description: "",
	});
	expect(otherId).toBeTruthy();

	// Name grammar is enforced (must match ^[a-z0-9]+(?:-[a-z0-9]+)*$).
	await expect(
		repo.create(db, { ownerId: "u9", name: "bad name", lowerName: "bad_name", description: "" }),
	).rejects.toBeInstanceOf(repo.InvalidRepositoryNameError);

	// The git route key `{owner}/{repo}` resolves by owner LOGIN (case-insensitive
	// on the repo side via lowerName).
	const found = await repo.getByOwnerAndName(db, "octocat", "HELLO-WORLD");
	expect(found?.id).toBe(id);
	expect(found?.isPrivate).toBe(false);

	// listByOwner is owner-scoped (u9 sees only its own repo).
	const mine = await repo.listByOwner(db, "u9");
	expect(mine.map((r) => r.name)).toEqual(["hello-world"]);
});

test("repository service: a brand-new Better Auth session user can create a repo (ensureUser materialises the owner row first)", async () => {
	const { db, adapter } = makeDb();
	await ensureSchema(adapter as any);

	// The session user has NO `users` row yet — exactly the path that used to
	// fail the repositories.ownerId FK when the UI stamped ownerId straight from
	// the session without materialising the user. `ensureUser` upserts it.
	const session = { user: { id: "ba-new-user", name: "Alice", email: "alice@example.com" } };
	const ownerId = await users.ensureUser(db, session as never);
	expect(ownerId).toBe("ba-new-user");

	// The materialised owner row exists, so the FK is satisfied.
	const id = await repo.create(db, {
		ownerId,
		name: "first-repo",
		lowerName: "first-repo",
		description: "created right after sign-up",
		isPrivate: false,
	});
	expect(id).toBeTruthy();

	// The repo resolves to the new owner by login.
	const found = await repo.getByOwnerAndName(db, "Alice", "first-repo");
	expect(found?.id).toBe(id);
	expect(found?.ownerId).toBe("ba-new-user");

	// ensureUser is idempotent — a second call reuses the same id without error.
	expect(await users.ensureUser(db, session as never)).toBe("ba-new-user");
});
