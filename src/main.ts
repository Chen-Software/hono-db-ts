import { Hono } from "hono";

import { PostService } from "./application/post-service";
import { UserService } from "./application/user-service";
import { PostRepo } from "./repository/post-repo";
import { UserRepo } from "./repository/user-repo";
import { LocalPostAssetStore } from "./providers/local-post-asset-store";
import { InMemoryBus } from "./services/event-bus";
import { MemoryStore } from "./storage/store";
import { postServiceApp } from "./transport/post-controller";
import { userServiceApp } from "./transport/user-controller";

// ---------------------------------------------------------------------------
// Composition root — the ONLY place that knows which infrastructure backs
// which port. The application layer (`UserService` / `PostService`) names only
// capabilities; this file picks the concrete adapters per deployment.
// ---------------------------------------------------------------------------

// 1. Infrastructure: concrete adapters implementing the ports.
const bus = new InMemoryBus("app", {
	durableTopics: [
		"user.created",
		"user.deleted",
		"post.created",
		"post.updated",
		"post.published",
		"post.deleted",
	],
});
const userRepo = UserRepo.overBlob("users", new MemoryStore()); // e.g. swap → overSql(...) for Postgres
const postRepo = new PostRepo(); // e.g. swap → PostgresPostRepository
const assetStore = new LocalPostAssetStore(new MemoryStore()); // e.g. swap → S3-backed store

// 2. Application services: depend ONLY on ports.
const userService = new UserService({ repo: userRepo, bus });
const postService = new PostService({ repo: postRepo, bus, assets: assetStore });

// 3. Transport: controllers translate HTTP requests into commands.
const app = new Hono();
app.get("/", (c) => c.json({ status: "ok" }));
app.route("/users", userServiceApp(userService));
app.route("/posts", postServiceApp(postService, postRepo));

const PORT = Number(Bun.env["PORT"] ?? 3000);

console.log(`Serving app on http://localhost:${PORT}`);

Bun.serve({ port: PORT, fetch: app.fetch });
