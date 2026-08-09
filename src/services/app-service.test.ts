import { describe, expect, it } from "bun:test";
import { AppService } from "./app-service";
import { type User, UserModel } from "../models/user";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const makeUser = (overrides?: Partial<User>): User =>
	UserModel.from({
		id: crypto.randomUUID(),
		name: "Alice",
		email: "alice@example.com",
		role: "member",
		age: 25,
		created_at: "2026-08-09T12:00:00.000Z",
		...overrides,
	});

const base = makeUser();

/** Build a plain (unvalidated) payload for sending invalid data to the API */
const payload = (overrides?: Record<string, unknown>) => ({
	id: crypto.randomUUID(),
	name: "Alice",
	email: "alice@example.com",
	role: "member",
	age: 25,
	created_at: "2026-08-09T12:00:00.000Z",
	...overrides,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hit the AppService — same as a real client would. */
function request(path: string, init?: RequestInit) {
	return AppService.request(path.startsWith("/") ? path : `/${path}`, init);
}

/** Prepend the UserService mount prefix. */
function users(path = "") {
	return `/users${path}`;
}

function jsonBody(body: unknown, method = "POST"): RequestInit {
	return {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("AppService", () => {
	// -----------------------------------------------------------------------
	// GET / — health check
	// -----------------------------------------------------------------------
	describe("GET /", () => {
		it("returns 200 with { status: 'ok' }", async () => {
			const res = await request("/");
			expect(res.status).toBe(200);

			const body = await res.json<{ status: string }>();
			expect(body.status).toBe("ok");
		});
	});

	// -----------------------------------------------------------------------
	// UserService route — mounted at /users
	// Verifies the full CRUD lifecycle works through the AppService mount.
	// -----------------------------------------------------------------------
	describe("UserService route (/users)", () => {
		// -------------------------------------------------------------------
		// POST /users — create
		// -------------------------------------------------------------------
		describe("POST /users", () => {
			it("creates a valid user and returns 201", async () => {
				const res = await request(users(), jsonBody(base));
				expect(res.status).toBe(201);

				const body = await res.json<User>();
				expect(body.id).toBe(base.id);
				expect(body.name).toBe(base.name);
			});

			it("rejects duplicate id with 409", async () => {
				const res = await request(users(), jsonBody(base));
				expect(res.status).toBe(409);
			});

			it("rejects bad email with 400", async () => {
				const res = await request(
					users(),
					jsonBody(payload({ email: "bad-email" })),
				);
				expect(res.status).toBe(400);
			});

			it("rejects underage (16) with 400", async () => {
				const res = await request(users(), jsonBody(payload({ age: 16 })));
				expect(res.status).toBe(400);
			});

			it("rejects illegal role with 400", async () => {
				const res = await request(
					users(),
					jsonBody(payload({ role: "superadmin" })),
				);
				expect(res.status).toBe(400);
			});

			it("rejects empty name with 400", async () => {
				const res = await request(users(), jsonBody(payload({ name: "" })));
				expect(res.status).toBe(400);
			});
		});

		// -------------------------------------------------------------------
		// GET /users — list
		// -------------------------------------------------------------------
		describe("GET /users", () => {
			it("returns a list containing the created user", async () => {
				const res = await request(users());
				expect(res.status).toBe(200);

				const list = await res.json<User[]>();
				expect(Array.isArray(list)).toBe(true);
				expect(list.some((u) => u.id === base.id)).toBe(true);
			});
		});

		// -------------------------------------------------------------------
		// GET /users/:id — read
		// -------------------------------------------------------------------
		describe("GET /users/:id", () => {
			it("returns the user for a valid id", async () => {
				const res = await request(users(`/${base.id}`));
				expect(res.status).toBe(200);
				expect((await res.json<User>()).id).toBe(base.id);
			});

			it("returns 404 for a missing id", async () => {
				const res = await request(
					users("/11111111-1111-4111-8111-111111111111"),
				);
				expect(res.status).toBe(404);
			});
		});

		// -------------------------------------------------------------------
		// PATCH /users/:id — update
		// -------------------------------------------------------------------
		describe("PATCH /users/:id", () => {
			it("updates name and returns the updated user", async () => {
				const res = await request(
					users(`/${base.id}`),
					jsonBody({ name: "Alicia" }, "PATCH"),
				);
				expect(res.status).toBe(200);

				const body = await res.json<User>();
				expect(body.name).toBe("Alicia");
				expect(body.id).toBe(base.id);
			});

			it("returns 404 when patching non-existent user", async () => {
				const res = await request(
					users("/00000000-0000-4000-8000-000000000000"),
					jsonBody({ name: "Ghost" }, "PATCH"),
				);
				expect(res.status).toBe(404);
			});
		});

		// -------------------------------------------------------------------
		// DELETE /users/:id
		// -------------------------------------------------------------------
		describe("DELETE /users/:id", () => {
			it("deletes user and returns 204", async () => {
				const res = await request(users(`/${base.id}`), { method: "DELETE" });
				expect(res.status).toBe(204);
			});

			it("returns 404 when deleting an already-deleted user", async () => {
				const res = await request(users(`/${base.id}`), { method: "DELETE" });
				expect(res.status).toBe(404);
			});
		});
	});

	// -----------------------------------------------------------------------
	// Error handling — AppService-level onError
	// -----------------------------------------------------------------------
	describe("error handling", () => {
		it("formats HTTP exceptions as { status: 'error', message }", async () => {
			// 404 from a missing user lookup
			const res = await request(users("/22222222-2222-4222-8222-222222222222"));
			expect(res.status).toBe(404);

			const body = await res.json<{ status: string; message: string }>();
			expect(body.status).toBe("error");
			expect(body.message).toBe("User not found");
		});

		it("returns a 404 JSON body for unknown routes", async () => {
			const res = await request("/nope");
			expect(res.status).toBe(404);
		});
	});
});
