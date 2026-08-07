import type { Hono as HonoApp } from "hono";
import * as movies from "./movies";
import { repos } from "@/repo/repos";

export function createAllRoutes(app: HonoApp) {
	if (repos["movies"]) {
		// Mount the movies CRUD routes under /movies, matching the documented
		// API surface (src/routes/movies.ts registers "/" and "/:id" on a sub-app).
		app.route("/movies", movies.createRoutes(repos["movies"]));
	}
}
