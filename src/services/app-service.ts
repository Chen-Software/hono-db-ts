import { Hono } from "hono";

import { PostService } from "../application/post-service";
import { UserService } from "../application/user-service";
import { LocalPostAssetStore } from "../providers/local-post-asset-store";
import { PostRepo } from "../repository/post-repo";
import { UserRepo } from "../repository/user-repo";
import { InMemoryBus } from "../services/event-bus";
import { MemoryStore } from "../storage/store";
import { postServiceApp } from "../transport/post-controller";
import { userServiceApp } from "../transport/user-controller";

/**
 * Legacy composition entry — the canonical composition root is `../main.ts`.
 * This mirrors its wiring so `AppService` (an exported Hono app) keeps
 * working for old entry points. Delete once `main.ts` is the only entry.
 */
export function createApp(): Hono {
	const bus = new InMemoryBus("app");
	const userRepo = UserRepo.overBlob("users", new MemoryStore());
	const postRepo = new PostRepo();
	const assetStore = new LocalPostAssetStore(new MemoryStore());

	const userService = new UserService({ repo: userRepo, bus });
	const postService = new PostService({
		repo: postRepo,
		bus,
		assets: assetStore,
	});

	const app = new Hono();
	app.get("/", (c) => c.json({ status: "ok" }));
	app.route("/users", userServiceApp(userService));
	app.route("/posts", postServiceApp(postService));
	return app;
}

export const AppService = createApp();
