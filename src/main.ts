import { Hono } from "hono";
import { moviesRoutes } from "./routes/movies";

const app = new Hono();

app.get("/", (c) => {
	return c.text("Hello Hono!");
});

app.route("/movies", moviesRoutes);

export default app;
