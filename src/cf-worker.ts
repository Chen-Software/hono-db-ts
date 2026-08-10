/**
 * `cf-worker.ts` — Cloudflare Workers entry point.
 *
 * This is the **production** entry point for the artefact application.
 * It shares ALL the same ports, application services, and transport
 * controllers as the local `main.ts` — only the infrastructure wiring
 * (D1 instead of bun:sqlite, R2 / CF blob bindings instead of fs/object)
 * differs.
 *
 * The worker exports a default object `{ fetch }` as required by the
 * Workers runtime.  `wrangler.jsonc` points to the built output of this
 * file via the `main` field.
 */

import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";

import { PostService } from "./application/post-service";
import { UserService } from "./application/user-service";
import { UserRepo } from "./repository/user-repo";
import { PostRepo } from "./repository/post-repo";
import { InMemoryBus } from "./services/event-bus";
import { userServiceApp } from "./transport/user-controller";
import { postServiceApp } from "./transport/post-controller";
import type { PostAssetStore } from "./ports/asset-store";

// ---------------------------------------------------------------------------
// Environment — the shape of `env` injected by Cloudflare Workers.
// Bindings declared in wrangler.jsonc must match these keys.
// ---------------------------------------------------------------------------

interface Env {
	/** D1 database binding (wrangler.jsonc → `d1_databases[].binding`). */
	DB: D1Database;
	// Future bindings (R2, KV, Queues, …) are added here.
}

// ---------------------------------------------------------------------------
// No-op asset store — PostService needs an `AssetStore` for image uploads.
// On Workers, implement this with R2 later.  For now it silently succeeds
// (images are accepted but thrown away).  Your real app should replace this.
// ---------------------------------------------------------------------------

class NoOpAssetStore implements PostAssetStore {
	async storeImage(_postId: string, _image: File | Blob): Promise<string> {
		// TODO: wire R2 — return the public URL after storing
		return "";
	}
	async deleteImage(_url: string): Promise<void> {
		// No-op
	}
}

// ---------------------------------------------------------------------------
// Application wiring
// ---------------------------------------------------------------------------

function createApp(env: Env): Hono {
	// ---- Infrastructure ----
	const db = drizzle(env.DB);
	const bus = new InMemoryBus("cf", {
		durableTopics: [
			"user.created",
			"user.deleted",
			"post.created",
			"post.updated",
			"post.published",
			"post.deleted",
		],
	});

	// Repositories
	const userRepo = UserRepo.overD1("users", db);
	const postRepo = new PostRepo();

	// Application services
	const userService = new UserService({ repo: userRepo, bus });
	const postService = new PostService({
		repo: postRepo,
		bus,
		assets: new NoOpAssetStore(),
	});

	// ---- Transport (Hono routing) ----
	const app = new Hono();

	// Health / root
	app.get("/", (c) => c.json({ status: "ok", runtime: "cloudflare-workers" }));

	// Domain routes
	app.route("/users", userServiceApp(userService));
	app.route("/posts", postServiceApp(postService));

	return app;
}

// ---------------------------------------------------------------------------
// Cloudflare Workers fetch handler
// ---------------------------------------------------------------------------

export default {
	async fetch(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
	): Promise<Response> {
		const app = createApp(env);
		return app.fetch(request);
	},
};
