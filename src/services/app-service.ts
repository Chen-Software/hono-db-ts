import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

const AppService = new Hono();

AppService.get("/", (c) => c.json({ status: "ok" }));

AppService.onError((err, c) => {
	console.error(err);
	if (err instanceof HTTPException) {
		return c.json({ status: "error", message: err.message }, err.status);
	}
	return c.json({ status: "error", message: err.message }, 500);
});

export { AppService };
