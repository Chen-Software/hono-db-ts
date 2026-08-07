import type { Hono } from "hono";
import * as movies from "./movies";
import { repos, type Repos } from "@/repo/repos";

export function createAllRoutes(app: Hono) {
	repos["movies"] && movies.createRoutes(app, repos["movies"]);
}
