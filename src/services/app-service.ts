import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { UserService } from "./user-service";

const AppService = new Hono();

AppService.get("/", (c) => c.json({ status: "ok" }));
AppService.route("/users", UserService);

AppService.onError((err, c) => {
	console.error(err);
	if (err instanceof HTTPException) {
		return c.json({ status: "error", message: err.message }, err.status);
	}
	return c.json({ status: "error", message: err.message }, 500);
});

export { AppService };
