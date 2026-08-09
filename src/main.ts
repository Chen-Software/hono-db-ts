import { Hono } from "hono";

import { AppService } from "./services/app-service";
import { UserService } from "./services/user-service";

const app = new Hono();
app.route("/", AppService);
app.route("/users", UserService);

const PORT = Number(Bun.env["PORT"] ?? 8080);

console.log(`Serving app-service on http://localhost:${PORT}`);

export default {
	port: PORT,
	fetch: app.fetch,
};
