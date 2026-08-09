import { typiaValidator } from "@hono/typia-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { User, UserModel } from "../models/user";
import { createVersionHistoryStore } from "./version-history-store";

// In-memory append-only version history — see version-history-store.ts.
// Shared with every versioned service so the history mechanics (create /
// append / latest / history / remove) live in exactly one place. The `User`
// model's `Versioned` capacity guarantees each stored instance is immutable
// and carries the same `id` with a strictly-later `updated_at` (the version).
const store = createVersionHistoryStore<User>();

const UserService = new Hono();

// GET / — list the latest version of every user
UserService.get("/", (c) => {
	const list = store.listLatest().map((u) => {
		const { id, name, email, role, age, created_at, updated_at } = u;
		return { id, name, email, role, age, created_at, updated_at };
	});
	return c.json(list);
});

// POST / — create a user with typia validation
UserService.post("/", typiaValidator("json", UserModel.validate), (c) => {
	const data = c.req.valid("json"); // typed as User
	if (store.has(data.id)) {
		throw new HTTPException(409, { message: "User already exists" });
	}
	// `updated_at` is authoritative: the first version is stamped with the
	// entity's birth time (`created_at`), regardless of what the client sent.
	const created = User.from({ ...data, updated_at: data.created_at });
	store.create(created);
	return c.json(created, 201);
});

// GET /:id — fetch the latest version of a user
UserService.get("/:id", (c) => {
	const id = c.req.param("id");
	const user = store.latestOf(id);
	if (!user) {
		throw new HTTPException(404, { message: "User not found" });
	}
	return c.json(user);
});

// GET /:id/history — fetch every version of a user (immutable audit log)
UserService.get("/:id/history", (c) => {
	const id = c.req.param("id");
	const history = store.historyOf(id);
	if (!history || history.length === 0) {
		throw new HTTPException(404, { message: "User not found" });
	}
	return c.json(history);
});

// PATCH /:id — partial update: creates a NEW instance, same id, version + 1
UserService.patch(
	"/:id",
	typiaValidator("json", UserModel.validatePartial),
	(c) => {
		const id = c.req.param("id");
		const existing = store.latestOf(id);
		if (!existing) {
			throw new HTTPException(404, { message: "User not found" });
		}
		const patch = c.req.valid("json"); // typed as Partial<User>
		// `existing.update` builds a brand-new immutable instance: same `id`, a
		// strictly-later `updated_at` (the version), and any `id`/`updated_at`
		// in the patch is overridden.
		const updated = existing.update(patch);
		store.append(updated);
		return c.json(updated);
	},
);

// DELETE /:id — remove a user and its full version history
UserService.delete("/:id", (c) => {
	const id = c.req.param("id");
	if (!store.has(id)) {
		throw new HTTPException(404, { message: "User not found" });
	}
	store.remove(id);
	return c.body(null, 204);
});

UserService.onError((err, c) => {
	console.error(err);
	if (err instanceof HTTPException) {
		return c.json({ status: "error", message: err.message }, err.status);
	}
	return c.json({ status: "error", message: err.message }, 500);
});

export { UserService };
