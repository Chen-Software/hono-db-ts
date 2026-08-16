import { test, expect } from "bun:test";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { ensureSchema } from "../http/schema";
import * as repo from "./repository";
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
