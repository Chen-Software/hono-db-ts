import { Hono } from "hono";
import { createD1MoviesRepo } from "./repo/movies-repo-d1";
import { createMoviesRoutes } from "./routes/movies";

/**
 * Cloudflare Workers entry point.
 * Uses the D1 binding defined in wrangler.json.
 */
function createApp(env: Env) {
	const app = new Hono();

	app.get("/", (c) => {
		return c.text("Hello Hono!");
	});

	app.route("/movies", createMoviesRoutes(createD1MoviesRepo(env.DB)));

	return app;
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		return createApp(env).fetch(request, env, ctx);
	},
};
