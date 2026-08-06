import { Hono } from "hono";
import { createSqliteMoviesRepo } from "./repo/movies-repo-sqlite";
import { createMoviesRoutes } from "./routes/movies";

const app = new Hono();

app.get("/", (c) => {
	return c.text("Hello Hono!");
});

app.route("/movies", createMoviesRoutes(createSqliteMoviesRepo()));

export default app;
