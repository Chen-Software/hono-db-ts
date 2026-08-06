import { describe, expect, it } from "bun:test";

describe("Hono server", () => {
	it('responds with "Hello Hono!" on GET /', async () => {
		const { default: app } = await import("./main");
		const res = await app.request("/");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("Hello Hono!");
	});
});
