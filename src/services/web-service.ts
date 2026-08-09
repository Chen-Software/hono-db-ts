import { Hono } from "hono";

const WebService = new Hono();

WebService.get("/", (c) => c.json({ status: "ok" }));

WebService.get("/", (c) => c.json({ status: "ok" }));

WebService.get("/info", (c) =>
	c.json({ status: "ok", service: "web-service" }),
);

WebService.onError((err, c) => {
	console.error(err);
	return c.json({ status: "error", message: err.message }, 500);
});

export { WebService };
