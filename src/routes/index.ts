import type { Hono as HonoApp } from "hono";
import * as movies from "./movies";
import { repos as defaultRepos, type Repos } from "@/repo/repos";

export function createAllRoutes(app: HonoApp, customRepos?: Repos) {
	const activeRepos = customRepos ?? defaultRepos;
	if (activeRepos["movies"]) {
		// Mount the movies CRUD routes under /movies, matching the documented
		// API surface (src/routes/movies.ts registers "/" and "/:id" on a sub-app).
		app.route("/movies", movies.createRoutes(activeRepos["movies"]));
	}
}
