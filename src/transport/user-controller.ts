import { Hono } from "hono";
import type { UserService } from "../application/user-service";
import type { UserRole } from "../ports/user-repository";

/**
 * `userServiceApp` — the REST TRANSPORT ADAPTER for `UserService`.
 *
 * This is NOT the service; it is a thin Hono app that maps HTTP onto the
 * service's operations:
 *
 *   POST   /            → userService.createUser(command)
 *   GET    /            → userService.listUsers() | listUsersByRole(role)
 *   GET    /:id         → userService.getUser(id)
 *   DELETE /:id         → userService.deleteUser(id)
 *
 * The same `UserService` could be reached via a CLI adapter or a queue
 * consumer instead — the operations do not change. We use Hono's in-process
 * `app.request(path, init)` (no listening socket) in tests, but the identical
 * routes serve a real server when mounted with `app.route`.
 */
export function userServiceApp(userService: UserService): Hono {
	const app = new Hono();

	app.post("/", async (c) => {
		try {
			const body = await c.req.json();
			const user = await userService.createUser(body);
			return c.json(user, 201);
		} catch (e) {
			return c.json({ error: (e as Error)?.message ?? "invalid input" }, 422);
		}
	});

	app.get("/", async (c) => {
		const role = c.req.query("role");
		const users = role
			? await userService.listUsersByRole(role as UserRole)
			: await userService.listUsers();
		return c.json(users);
	});

	app.get("/:id", async (c) => {
		const user = await userService.getUser(c.req.param("id"));
		if (!user) return c.json({ error: "not found" }, 404);
		return c.json(user);
	});

	app.delete("/:id", async (c) => {
		await userService.deleteUser(c.req.param("id"));
		return c.body(null, 204);
	});

	return app;
}
