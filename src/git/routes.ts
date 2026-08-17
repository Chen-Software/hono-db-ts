/**
 * routes — git smart-HTTP transport (root-level, not under /api).
 *
 * Mirrors Forgejo's `routers/web/repo/http.go`: `GET /owner/repo.git/info/refs`
 * and the `POST .../git-receive-pack` / `.../git-upload-pack` endpoints. The
 * git remote URL therefore is `https://host/owner/repo(.git)`.
 *
 * Auth: public repos are world-readable; private repos require a session OR
 * Basic auth (P0-1); push (receive-pack) additionally requires the
 * authenticated user to own the repo (and a write-scoped token when using a
 * PAT). Archived / mirror repos reject pushes (P0-4).
 */

import { Hono, type Context } from "hono";
import type { Db } from "@/services/types";
import { createServices } from "@/services";
import type { GitBackend } from "./backend";
import { receivePackAdvertise, receivePackService } from "./receive";
import { uploadPackAdvertise, uploadPackService } from "./upload";
import { ZERO_OID, concatBytes } from "./protocol";
import { resolveGitUser } from "./auth";

export interface GitQueue {
	/** Durable action sink — `repo.push` events are sent after a successful push. */
	send(msg: unknown): Promise<void> | void;
}

export interface GitRouteOptions {
	db: Db;
	gitBackend: GitBackend;
	queue?: GitQueue;
}

/** Hard cap on push/fetch POST bodies (plan: 500 MB). */
const MAX_BODY_BYTES = 500 * 1024 * 1024;

/** Thrown when the request body exceeds MAX_BODY_BYTES. */
class PayloadTooLarge extends Error {}

function stripGit(name: string): string {
	// Forgejo lowercases the URL path; normalise so `Git/Repo.git` and
	// `git/repo.git` resolve to the same repo (B9).
	return name.replace(/\.git$/, "").toLowerCase();
}

/** Normalise an `{owner}/{repo}` URL pair: lowercase both (B9). */
function normalizeOwner(owner: string): string {
	return owner.toLowerCase();
}

/** 401 with the Basic challenge — set on every 401 (Forgejo parity, P0-1). */
function unauthorized(message = "authentication required"): Response {
	return new Response(message, {
		status: 401,
		headers: { "WWW-Authenticate": 'Basic realm="CodeForge"' },
	});
}

/** Read the request body with a hard size cap — never an unbounded buffer. */
async function readCappedBody(c: Context, maxBytes: number): Promise<Uint8Array> {
	const lenHeader = c.req.header("content-length");
	if (lenHeader) {
		const len = Number.parseInt(lenHeader, 10);
		if (Number.isFinite(len) && len > maxBytes) throw new PayloadTooLarge();
	}
	const stream = c.req.raw.body;
	if (!stream) return new Uint8Array(0);
	const chunks: Uint8Array[] = [];
	let total = 0;
	const reader = stream.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) {
				total += value.byteLength;
				if (total > maxBytes) {
					await reader.cancel().catch(() => {});
					throw new PayloadTooLarge();
				}
				chunks.push(value);
			}
		}
	} finally {
		reader.releaseLock();
	}
	if (chunks.length === 0) return new Uint8Array(0);
	if (chunks.length === 1) return chunks[0]!;
	return concatBytes(chunks);
}

/** Validate the smart-HTTP POST content-type (Forgejo `serviceRPC` parity). */
function assertContentType(c: Context, service: string): Response | null {
	// The protocol request Content-Type uses the service *suffix* (e.g.
	// `application/x-git-receive-pack-request`), not the full `git-receive-pack`.
	const suffix = service.replace(/^git-/, "");
	const expected = `application/x-git-${suffix}-request`;
	const base = c.req.header("content-type")?.split(";")[0]?.trim();
	if (base !== expected) return unauthorized("invalid content-type");
	return null;
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
		const owner = normalizeOwner(c.req.param("owner"));
		const repo = stripGit(c.req.param("repo"));
		const rec = await resolve(owner, repo);
		if (!rec) return new Response("not found", { status: 404 });
		if (rec.isPrivate) {
			const user = await resolveGitUser(c, opts.db);
			if (!user) return unauthorized();
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
		const ctErr = assertContentType(c, "git-upload-pack");
		if (ctErr) return ctErr;
		const owner = normalizeOwner(c.req.param("owner"));
		const repo = stripGit(c.req.param("repo"));
		const rec = await resolve(owner, repo);
		if (!rec) return new Response("not found", { status: 404 });
		if (rec.isPrivate) {
			const user = await resolveGitUser(c, opts.db);
			if (!user) return unauthorized();
		}
		let body: Uint8Array;
		try {
			body = await readCappedBody(c, MAX_BODY_BYTES);
		} catch (e) {
			if (e instanceof PayloadTooLarge) return new Response("payload too large", { status: 413 });
			throw e;
		}
		const gitdir = gitBackend.gitdirFor(owner, repo);
		const fs = gitBackend.fsFor(owner, repo);
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
		const ctErr = assertContentType(c, "git-receive-pack");
		if (ctErr) return ctErr;
		const owner = normalizeOwner(c.req.param("owner"));
		const repo = stripGit(c.req.param("repo"));
		const rec = await resolve(owner, repo);
		if (!rec) return new Response("not found", { status: 404 });
		// Archived + mirror repos reject pushes (Forgejo semantics, B4).
		if (rec.isArchived) {
			return new Response(
				"This repo is archived. You can view files and clone it, but cannot push or open issues/pull-requests.",
				{ status: 403 },
			);
		}
		if (rec.isMirror) {
			return new Response("mirror repository is read-only", { status: 403 });
		}
		const user = await resolveGitUser(c, opts.db);
		if (!user) return unauthorized();
		// Owner-only push for now; PATs must carry the write scope (P0-1).
		if (user.type === "token" && !(user.scopes ?? []).includes("write:repository")) {
			return new Response("token lacks write:repository scope", { status: 403 });
		}
		if (rec.ownerId !== user.id) return new Response("forbidden", { status: 403 });
		const gitdir = gitBackend.gitdirFor(owner, repo);
		const fs = gitBackend.fsFor(owner, repo);
		await gitBackend.ensureRepo(owner, repo);
		let body: Uint8Array;
		try {
			body = await readCappedBody(c, MAX_BODY_BYTES);
		} catch (e) {
			if (e instanceof PayloadTooLarge) return new Response("payload too large", { status: 413 });
			throw e;
		}
		const { report, commands } = await receivePackService(fs, gitdir, body);
		// Publish a `repo.push` action for every ref update (never fail the push
		// response because the queue is unavailable — log and continue).
		if (opts.queue) {
			for (const cmd of commands) {
				try {
					await opts.queue.send({
						type: "repo.push",
						owner,
						repo,
						ref: cmd.ref,
						oldoid: cmd.oldoid,
						oid: cmd.newoid,
						deleted: cmd.newoid === ZERO_OID,
						pusherId: user.id,
						ts: new Date().toISOString(),
					});
				} catch (e) {
					console.error(`[git] queue.send(repo.push) failed for ${owner}/${repo}:`, e);
				}
			}
		}
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
