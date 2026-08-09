import { typiaValidator } from "@hono/typia-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { type User, UserModel } from "../models/user";

// in-memory store — swap for a real DB/ORM when ready
const users = new Map<string, User>();

const UserService = new Hono();

// GET / — list all users
UserService.get("/", (c) => {
	const list = Array.from(users.values()).map(
		({ id, name, email, role, age, created_at }) => ({
			id,
			name,
			email,
			role,
			age,
			created_at,
		}),
	);
	return c.json(list);
});

// POST / — create a user with typia validation
UserService.post("/", typiaValidator("json", UserModel.validate), (c) => {
	const data = c.req.valid("json"); // typed as User
	if (users.has(data.id)) {
		throw new HTTPException(409, { message: "User already exists" });
	}
	users.set(data.id, data);
	return c.json(data, 201);
});

// GET /:id — fetch a single user
UserService.get("/:id", (c) => {
	const id = c.req.param("id");
	const user = users.get(id);
	if (!user) {
		throw new HTTPException(404, { message: "User not found" });
	}
	return c.json(user);
});

// PATCH /:id — partial update with typia validation
UserService.patch(
	"/:id",
	typiaValidator("json", UserModel.validatePartial),
	(c) => {
		const id = c.req.param("id");
		const existing = users.get(id);
		if (!existing) {
			throw new HTTPException(404, { message: "User not found" });
		}
		const patch = c.req.valid("json"); // typed as Partial<User>
		const updated = { ...existing, ...patch, id: existing.id }; // id is immutable
		users.set(id, updated);
		return c.json(updated);
	},
);

// DELETE /:id — remove a user
UserService.delete("/:id", (c) => {
	const id = c.req.param("id");
	if (!users.has(id)) {
		throw new HTTPException(404, { message: "User not found" });
	}
	users.delete(id);
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
