import { typiaValidator } from "@hono/typia-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { User, UserModel } from "../models/user";

// In-memory store — swap for a real DB/ORM when ready.
//
// Each `id` maps to an append-only HISTORY of immutable `User` instances.
// The core invariant: a modification never mutates an existing instance — it
// creates a brand-new `User` with the SAME `id` and a *strictly later*
// `updated_at` (the version timestamp), and pushes it onto the history. Prior
// versions are retained (audit trail / time-travel), and `id` is never reused
// or changed.
const histories = new Map<string, User[]>();

/** Latest (newest `updated_at`) instance for an id, or undefined if absent. */
const latestOf = (id: string): User | undefined => {
	const history = histories.get(id);
	if (!history || history.length === 0) return undefined;
	// noUncheckedIndexedAccess: length was checked above.
	return history[history.length - 1];
};

const UserService = new Hono();

// GET / — list the latest version of every user
UserService.get("/", (c) => {
	const list = Array.from(histories.values()).map((history) => {
		const u = history[history.length - 1]!;
		const { id, name, email, role, age, created_at, updated_at } = u;
		return { id, name, email, role, age, created_at, updated_at };
	});
	return c.json(list);
});

// POST / — create a user with typia validation
UserService.post("/", typiaValidator("json", UserModel.validate), (c) => {
	const data = c.req.valid("json"); // typed as User
	if (histories.has(data.id)) {
		throw new HTTPException(409, { message: "User already exists" });
	}
	// `updated_at` is authoritative: the first version is stamped with the
	// entity's birth time (`created_at`), regardless of what the client sent.
	const created = User.from({ ...data, updated_at: data.created_at });
	histories.set(created.id, [created]);
	return c.json(created, 201);
});

// GET /:id — fetch the latest version of a user
UserService.get("/:id", (c) => {
	const id = c.req.param("id");
	const user = latestOf(id);
	if (!user) {
		throw new HTTPException(404, { message: "User not found" });
	}
	return c.json(user);
});

// GET /:id/history — fetch every version of a user (immutable audit log)
UserService.get("/:id/history", (c) => {
	const id = c.req.param("id");
	const history = histories.get(id);
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
		const existing = latestOf(id);
		if (!existing) {
			throw new HTTPException(404, { message: "User not found" });
		}
		const patch = c.req.valid("json"); // typed as Partial<User>
		// `existing.update` builds a brand-new immutable instance: same `id`, a
		// strictly-later `updated_at` (the version), and any `id`/`updated_at`
		// in the patch is overridden.
		const updated = existing.update(patch);
		histories.get(id)!.push(updated);
		return c.json(updated);
	},
);

// DELETE /:id — remove a user and its full version history
UserService.delete("/:id", (c) => {
	const id = c.req.param("id");
	if (!histories.has(id)) {
		throw new HTTPException(404, { message: "User not found" });
	}
	histories.delete(id);
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
