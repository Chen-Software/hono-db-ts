import { describe, expect, it } from "bun:test";
import { UserService } from "./user-service";
import { type User, UserModel } from "../models/user";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const makeUser = (overrides?: Partial<User>): User =>
	UserModel.new({
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
function request(path: string, init?: RequestInit) {
	return UserService.request(path.startsWith("/") ? path : `/${path}`, init);
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
describe("UserService", () => {
	// -----------------------------------------------------------------------
	// POST / — create
	// -----------------------------------------------------------------------
	describe("POST /", () => {
		it("creates a valid user and returns 201", async () => {
			const res = await request("/", jsonBody(base));
			expect(res.status).toBe(201);

			const body = await res.json<User>();
			expect(body.id).toBe(base.id);
			expect(body.name).toBe(base.name);
		});

		it("rejects duplicate id with 409", async () => {
			const res = await request("/", jsonBody(base));
			expect(res.status).toBe(409);
		});

		it("rejects bad email with 400", async () => {
			const res = await request("/", jsonBody(payload({ email: "bad-email" })));
			expect(res.status).toBe(400);
		});

		it("rejects underage (16) with 400", async () => {
			const res = await request("/", jsonBody(payload({ age: 16 })));
			expect(res.status).toBe(400);
		});

		it("rejects illegal role with 400", async () => {
			const res = await request("/", jsonBody(payload({ role: "superadmin" })));
			expect(res.status).toBe(400);
		});

		it("rejects empty name with 400", async () => {
			const res = await request("/", jsonBody(payload({ name: "" })));
			expect(res.status).toBe(400);
		});
	});

	// -----------------------------------------------------------------------
	// GET / — list
	// -----------------------------------------------------------------------
	describe("GET /", () => {
		it("returns a list containing the created user", async () => {
			const res = await request("/");
			expect(res.status).toBe(200);

			const list = await res.json<User[]>();
			expect(Array.isArray(list)).toBe(true);
			expect(list.some((u) => u.id === base.id)).toBe(true);
		});
	});

	// -----------------------------------------------------------------------
	// GET /:id — read
	// -----------------------------------------------------------------------
	describe("GET /:id", () => {
		it("returns the user for a valid id", async () => {
			const res = await request(`/${base.id}`);
			expect(res.status).toBe(200);
			expect((await res.json<User>()).id).toBe(base.id);
		});

		it("returns 404 for a missing id", async () => {
			const res = await request("/11111111-1111-4111-8111-111111111111");
			expect(res.status).toBe(404);
		});
	});

	// -----------------------------------------------------------------------
	// PATCH /:id — update
	// -----------------------------------------------------------------------
	describe("PATCH /:id", () => {
		it("updates name and returns the updated user", async () => {
			const res = await request(
				`/${base.id}`,
				jsonBody({ name: "Alicia" }, "PATCH"),
			);
			expect(res.status).toBe(200);

			const body = await res.json<User>();
			expect(body.name).toBe("Alicia");
			expect(body.id).toBe(base.id);
		});

		it("returns 404 when patching non-existent user", async () => {
			const res = await request(
				"/00000000-0000-4000-8000-000000000000",
				jsonBody({ name: "Ghost" }, "PATCH"),
			);
			expect(res.status).toBe(404);
		});
	});

	// -----------------------------------------------------------------------
	// DELETE /:id
	// -----------------------------------------------------------------------
	describe("DELETE /:id", () => {
		it("deletes user and returns 204", async () => {
			const res = await request(`/${base.id}`, { method: "DELETE" });
			expect(res.status).toBe(204);
		});

		it("returns 404 when deleting an already-deleted user", async () => {
			const res = await request(`/${base.id}`, { method: "DELETE" });
			expect(res.status).toBe(404);
		});
	});
});
