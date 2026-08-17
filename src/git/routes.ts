/**
 * routes — git smart-HTTP transport (root-level, not under /api).
 *
 * Mirrors Forgejo's `routers/web/repo/http.go`: `GET /owner/repo.git/info/refs`
 * and the `POST .../git-receive-pack` / `.../git-upload-pack` endpoints. The
 * git remote URL therefore is `https://host/owner/repo(.git)`.
 *
 * Auth: public repos are world-readable; private repos require a session; push
 * (receive-pack) additionally requires the authenticated user to own the repo.
 */

import { Hono } from "hono";
import type { Db } from "@/services/types";
import { getSession } from "@/auth/context";
import { createServices } from "@/services";
import type { GitBackend } from "./backend";
import { receivePackAdvertise, receivePackService } from "./receive";
import { uploadPackAdvertise, uploadPackService } from "./upload";

export interface GitRouteOptions {
	db: Db;
	gitBackend: GitBackend;
}

function stripGit(name: string): string {
	return name.replace(/\.git$/, "");
}

/** Mount the git transport routes onto a root Hono app. */
export function mountGitRoutes(app: Hono, opts: GitRouteOptions): void {
	const svc = createServices(opts.db);
	const { gitBackend } = opts;

	async function resolve(ownerLogin: string, repoName: string) {
		return svc.repository.getByOwnerAndName(ownerLogin, repoName);
	}

	app.get("/:owner/:repo/info/refs", async (c) => {
		const service = c.req.query("service");
		if (service !== "git-upload-pack" && service !== "git-receive-pack") {
			return new Response("expected service=git-upload-pack|git-receive-pack", { status: 400 });
		}
		const owner = c.req.param("owner");
		const repo = stripGit(c.req.param("repo"));
		const rec = await resolve(owner, repo);
		if (!rec) return new Response("not found", { status: 404 });
		if (rec.isPrivate) {
			const s = await getSession(c).catch(() => null);
			if (!s?.user) return new Response("authentication required", { status: 401 });
		}
		// A repo that exists in the DB but has no git data yet (freshly created,
		// or this is its first interaction) must be initialised before EITHER
		// advertisement: `git clone` of an empty repo (upload-pack) needs a bare
		// repo to advertise zero refs, and the first `git push` (receive-pack)
		// needs somewhere to write objects. ensureRepo is idempotent (stats HEAD
		// and returns when already initialised), so it is cheap on every refs hit.
		await gitBackend.ensureRepo(owner, repo);
		const gitdir = gitBackend.gitdirFor(owner, repo);
		const fs = gitBackend.fsFor(owner, repo);
		const bytes =
			service === "git-upload-pack"
				? await uploadPackAdvertise(fs, gitdir)
				: await receivePackAdvertise(fs, gitdir);
		return new Response(Buffer.from(bytes), {
			status: 200,
			headers: {
				"content-type": `application/x-${service}-advertisement`,
				// Required by the real git CLI for ref advertisements; harmless
				// for the isomorphic-git client.
				"cache-control": "no-cache, max-age=0, must-revalidate",
				expires: "Fri, 01 Jan 1980 00:00:00 GMT",
			},
		});
	});

	app.post("/:owner/:repo/git-upload-pack", async (c) => {
		const owner = c.req.param("owner");
		const repo = stripGit(c.req.param("repo"));
		const rec = await resolve(owner, repo);
		if (!rec) return new Response("not found", { status: 404 });
		if (rec.isPrivate) {
			const s = await getSession(c).catch(() => null);
			if (!s?.user) return new Response("authentication required", { status: 401 });
		}
		const gitdir = gitBackend.gitdirFor(owner, repo);
		const fs = gitBackend.fsFor(owner, repo);
		const body = new Uint8Array(await c.req.arrayBuffer());
		const pack = await uploadPackService(fs, gitdir, body);
		return new Response(Buffer.from(pack), {
			status: 200,
			headers: {
				"content-type": "application/x-git-upload-pack-result",
				"cache-control": "no-cache, max-age=0, must-revalidate",
				expires: "Fri, 01 Jan 1980 00:00:00 GMT",
			},
		});
	});

	app.post("/:owner/:repo/git-receive-pack", async (c) => {
		const owner = c.req.param("owner");
		const repo = stripGit(c.req.param("repo"));
		const rec = await resolve(owner, repo);
		if (!rec) return new Response("not found", { status: 404 });
		const session = await getSession(c).catch(() => null);
		if (!session?.user) return new Response("authentication required", { status: 401 });
		if (rec.ownerId !== session.user.id) return new Response("forbidden", { status: 403 });
		const gitdir = gitBackend.gitdirFor(owner, repo);
		const fs = gitBackend.fsFor(owner, repo);
		await gitBackend.ensureRepo(owner, repo);
		const body = new Uint8Array(await c.req.arrayBuffer());
		const { report } = await receivePackService(fs, gitdir, body);
		return new Response(Buffer.from(report), {
			status: 200,
			headers: {
				"content-type": "application/x-git-receive-pack-result",
				"cache-control": "no-cache, max-age=0, must-revalidate",
				expires: "Fri, 01 Jan 1980 00:00:00 GMT",
			},
		});
	});
}
