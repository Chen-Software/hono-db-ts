import { Hono } from "hono";

const AppService = new Hono();

AppService.get("/", (c) => c.json({ status: "ok" }));

AppService.get("/", (c) => c.json({ status: "ok" }));

AppService.get("/info", (c) =>
	c.json({ status: "ok", service: "web-service" }),
);

AppService.onError((err, c) => {
	console.error(err);
	return c.json({ status: "error", message: err.message }, 500);
});

export { AppService };
