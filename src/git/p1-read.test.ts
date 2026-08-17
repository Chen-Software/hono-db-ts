/**
 * P1 read-layer e2e — diff (P1-1) + branch/tag services (P1-2) against a real
 * repo, exercised BOTH at the module level and through the `/api/page/...`
 * endpoints. Asserts:
 *   - diffCommits/diffCommit produce add/mod/del/rename with correct hunks + stats
 *   - branch CRUD (create/list/rename/delete/containing)
 *   - tag CRUD (create lightweight + annotated, list-peel, delete)
 *   - the endpoints in buildQueryApp route those same operations
 */

import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import * as git from "isomorphic-git";
import { run } from "@/services/types";
import { createQueryDb } from "@/db/client";
import { resolveDatabaseTarget } from "@/http/schema";
import { buildQueryApp } from "@/http/app";
import { mountGitRoutes } from "@/git/routes";
import { localGitBackend } from "@/git/backend";
import { nodeFs } from "@/git/fs-node";
import { diffCommit, diffCommits, parseHunkHeader } from "@/git/diff";
import {
	branchesContaining,
	createBranch,
	deleteBranch,
	listBranches,
	renameBranch,
} from "@/git/branches";
import { createTag, deleteTag, listTags, resolveTag } from "@/git/tags";

const OWNER_ID = "00000000-0000-0000-0000-0000000000aa";
const REPO_ID = "11111111-1111-1111-1111-1111111111bb";
const OWNER = "owner";
const REPO = "repo";

const AUTHOR = { name: OWNER, email: "owner@example.com" };

/** Seed the DB the way the git e2e does (user + repo rows). */
async function seed(db: any) {
	const now = new Date().toISOString();
	await run(db, `INSERT INTO users (id, created_at, name, email) VALUES (?, ?, ?, ?)`, [OWNER_ID, now, OWNER, "owner@example.com"]);
	await run(
		db,
		`INSERT INTO "repositories" (
			"id","created_at","ownerId","name","lowerName","description",
			"defaultBranch","website","isPrivate","isArchived","isMirror","isTemplate",
			"objectFormatName","topics","numStars","numForks","numOpenIssues",
			"numClosedIssues","size","avatar","status"
		) VALUES (?,?,?,?,?,?,?,?,0,0,0,0,'sha1','[]',0,0,0,0,0,'',0)`,
		[REPO_ID, now, OWNER_ID, REPO, REPO, "test repo", "main", ""],
	);
}

function buildApp(db: any, gitBackend: ReturnType<typeof localGitBackend>): Hono {
	const app = new Hono();
	app.use("*", async (c, next) => {
		const env = (c.env as Record<string, unknown>) ?? {};
		env.auth = { api: { getSession: async () => ({ user: { id: OWNER_ID, name: OWNER } }) } };
		(c as unknown as { env: unknown }).env = env;
		await next();
	});
	app.route("/api", buildQueryApp(db, undefined, gitBackend));
	// The git smart-HTTP transport mounts at root (`/owner/repo.git`), which is
	// where the test's `git.push`/`git.clone` clients talk to.
	mountGitRoutes(app, { db, gitBackend });
	return app;
}

/** Commit a set of {path → content} changes in one commit; returns its oid. */
async function commitAll(
	fs: any,
	dir: string,
	message: string,
	changes: Record<string, string>,
): Promise<string> {
	for (const [path, content] of Object.entries(changes)) {
		if (content === "") {
			// Empty string = DELETE the file.
			await fs.promises.unlink(join(dir, path)).catch(() => {});
			await git.remove({ fs, dir, filepath: path });
		} else {
			await fs.promises.mkdir(join(dir, path.split("/").slice(0, -1).join("/")), { recursive: true }).catch(() => {});
			await fs.promises.writeFile(join(dir, path), content);
			await git.add({ fs, dir, filepath: path });
		}
	}
	await git.commit({ fs, dir, message, author: AUTHOR, committer: AUTHOR });
	return git.resolveRef({ fs, dir, ref: "HEAD" });
}

test("P1-1 · diffCommits: add/mod/del + rename detection with hunks & stats", async () => {
	const base = mkdtempSync(join(tmpdir(), "cf-p1diff-"));
	const fs = nodeFs();
	const dir = join(base, "repo");
	try {
		await git.init({ fs, dir, defaultBranch: "main" });
		// c1: three files added (hello will be DELETED; old.ts will be RENAMED).
		const c1 = await commitAll(fs, dir, "add readme + hello", {
			"README.md": "# Hello\nLine2\nLine3\nLine4\n",
			"src/hello.ts": "export const hi = 'hi';\n",
			"src/old.ts": "const keep = 1;\n",
		});
		// c2: modify README (insert a line), delete hello, add a new file, and
		// rename old.ts → renamed.ts (identical content hash → -M pairs them).
		const c2 = await commitAll(fs, dir, "edit + move", {
			"README.md": "# Hello\nLine2\nINSERTED\nLine3\nLine4\n",
			"src/hello.ts": "", // delete
			"docs/guide.md": "# Guide\n",
			"src/old.ts": "", // delete (source of the rename)
			"src/renamed.ts": "const keep = 1;\n",
		});

		// Full diff c1 → c2.
		const d = await diffCommits(fs, join(dir, ".git"), c1, c2);
		expect(d.base).toBe(c1);
		expect(d.head).toBe(c2);
		const byPath = Object.fromEntries(d.files.map((f) => [f.path, f]));
		// README modified with an insertion hunk.
		expect(byPath["README.md"].status).toBe("modified");
		expect(byPath["README.md"].additions).toBe(1);
		expect(byPath["README.md"].deletions).toBe(0);
		expect(byPath["README.md"].hunks?.[0].header).toContain("@@");
		// src/hello.ts deleted (standalone delete — no matching add).
		expect(byPath["src/hello.ts"].status).toBe("deleted");
		// docs/guide.md added.
		expect(byPath["docs/guide.md"].status).toBe("added");
		// src/renamed.ts is a RENAME of src/old.ts (identical content hash).
		expect(byPath["src/renamed.ts"].status).toBe("renamed");
		expect(byPath["src/renamed.ts"].oldPath).toBe("src/old.ts");
		// Deleted + renamed are NOT both reported — rename consumed old.ts's delete.
		expect(d.files.some((f) => f.path === "src/old.ts" && f.status === "deleted")).toBe(false);
		// Stats: files = 4 entries; additions/deletions fold in ONLY the modified
		// file's in-place line changes (README +1). Added/deleted files render
		// hunks but their full-content counts stay out of the total (the contract
		// of the rewrite: stat = in-place line changes).
		expect(d.stats.files).toBe(4);
		expect(d.stats.additions).toBe(1);
		expect(d.stats.deletions).toBe(0);
		// File-level counts: guide = 1 added line, hello = 1 deleted line.
		expect(byPath["docs/guide.md"].additions).toBe(1);
		expect(byPath["src/hello.ts"].deletions).toBe(1);

		// Single-commit diff (c2 vs its parent c1) matches.
		const single = await diffCommit(fs, join(dir, ".git"), c2);
		expect(single.stats.files).toBe(d.stats.files);

		// Root-commit diff (c1 vs empty tree) → all added.
		const root = await diffCommits(fs, join(dir, ".git"), "", c1);
		expect(root.files.length).toBe(3);
		expect(root.files.every((f) => f.status === "added")).toBe(true);

		// parseHunkHeader round-trip.
		const h = byPath["README.md"].hunks![0];
		const parsed = parseHunkHeader(h.header);
		expect(parsed).not.toBeNull();
		expect(parsed!.oldStart).toBe(h.oldStart);
		expect(parsed!.newStart).toBe(h.newStart);
	} finally {
		rmSync(base, { recursive: true, force: true });
	}
});

test("P1-2 · branch CRUD: create/list/rename/delete + containing", async () => {
	const base = mkdtempSync(join(tmpdir(), "cf-p1br-"));
	const fs = nodeFs();
	const dir = join(base, "repo");
	try {
		await git.init({ fs, dir, defaultBranch: "main" });
		const c1 = await commitAll(fs, dir, "base", { "a.txt": "A\n" });
		const gitdir = join(dir, ".git");

		// Create `feature` from main.
		await createBranch(fs, gitdir, "feature", "main");
		const { branches, total } = await listBranches(fs, gitdir);
		expect(total).toBe(2);
		const names = branches.map((b) => b.name);
		expect(names).toContain("main");
		expect(names).toContain("feature");
		const main = branches.find((b) => b.name === "main");
		expect(main?.oid).toBe(c1);
		expect(main?.latestCommit?.message.trim()).toBe("base");

		// Advance `feature` with a new commit → `branchesContaining(c1)` true.
		await git.checkout({ fs, dir, ref: "feature" });
		const c2 = await commitAll(fs, dir, "feature work", { "b.txt": "B\n" });
		expect(await branchesContaining(fs, gitdir, c1)).toEqual(["feature", "main"]);
		expect(await branchesContaining(fs, gitdir, c2)).toEqual(["feature"]);

		// Rename feature → dev; delete dev.
		await renameBranch(fs, gitdir, "feature", "dev");
		expect((await listBranches(fs, gitdir)).branches.map((b) => b.name)).not.toContain("feature");
		expect((await listBranches(fs, gitdir)).branches.map((b) => b.name)).toContain("dev");
		await deleteBranch(fs, gitdir, "dev");
		expect((await listBranches(fs, gitdir)).branches.map((b) => b.name)).not.toContain("dev");
	} finally {
		rmSync(base, { recursive: true, force: true });
	}
});

test("P1-2 · tag CRUD: lightweight + annotated create, peel, list, delete", async () => {
	const base = mkdtempSync(join(tmpdir(), "cf-p1tag-"));
	const fs = nodeFs();
	const dir = join(base, "repo");
	try {
		await git.init({ fs, dir, defaultBranch: "main" });
		const c1 = await commitAll(fs, dir, "base", { "a.txt": "A\n" });
		const gitdir = join(dir, ".git");

		// Lightweight tag.
		const lt = await createTag(fs, gitdir, "v0.1", "main");
		expect(lt.type).toBe("lightweight");
		expect(await resolveTag(fs, gitdir, "v0.1")).toBe(c1);

		// Annotated tag.
		const at = await createTag(fs, gitdir, "v1.0", "main", {
			annotated: true,
			message: "release 1.0",
			tagger: { name: OWNER, email: "owner@example.com" },
		});
		expect(at.type).toBe("annotated");
		expect(await resolveTag(fs, gitdir, "v1.0")).toBe(c1);

		const tags = await listTags(fs, gitdir);
		const byName = Object.fromEntries(tags.map((t) => [t.name, t]));
		expect(byName["v0.1"].type).toBe("lightweight");
		expect(byName["v0.1"].oid).toBe(c1);
		expect(byName["v1.0"].type).toBe("annotated");
		expect(byName["v1.0"].oid).toBe(c1);
		expect(byName["v1.0"].message?.trim()).toBe("release 1.0");

		// The annotated tag wrote a REAL tag object — the ref oid differs from the
		// commit oid (clone/refs.ts peels it via `^{}`).
		const refOid = await git.resolveRef({ fs, gitdir, ref: "refs/tags/v1.0" });
		expect(refOid).not.toBe(c1);

		await deleteTag(fs, gitdir, "v0.1");
		expect((await listTags(fs, gitdir)).map((t) => t.name)).toEqual(["v1.0"]);
	} finally {
		rmSync(base, { recursive: true, force: true });
	}
});

test("P1-1/P1-2 · HTTP endpoints: /commit/:oid/diff, /compare, /branches, /tags", async () => {
	const base = mkdtempSync(join(tmpdir(), "cf-p1http-"));
	const gitRoot = join(base, "gitdata");
	const client = join(base, "client");
	let db: any = null;
	try {
		const dbFile = join(base, "test.db");
		const target = resolveDatabaseTarget(`file:${dbFile}`, "sqlite");
		db = await createQueryDb(target);
		await seed(db);

		const gitBackend = localGitBackend(gitRoot);
		const app = buildApp(db, gitBackend);
		const fs = nodeFs();

		// Push two commits so the server repo has history.
		await git.init({ fs, dir: client, defaultBranch: "main" });
		await commitAll(fs, client, "c1", { "README.md": "A\n" });
		const c1 = await git.resolveRef({ fs, dir: client, ref: "HEAD" });
		await git.push({ fs, http: makeHttp(app), dir: client, url: `http://localhost/${OWNER}/${REPO}.git`, ref: "main" });
		await commitAll(fs, client, "c2", { "README.md": "A\nB\n" });
		const c2 = await git.resolveRef({ fs, dir: client, ref: "HEAD" });
		await git.push({ fs, http: makeHttp(app), dir: client, url: `http://localhost/${OWNER}/${REPO}.git`, ref: "main" });

		const baseUrl = `http://localhost/api/page/repositories/${REPO_ID}`;

		// Diff of a single commit (c2 vs its parent c1).
		const diffRes = await app.request(`${baseUrl}/commit/${c2}/diff`);
		expect(diffRes.status).toBe(200);
		const diffBody = (await diffRes.json()) as any;
		expect(diffBody.data.diff.stats.files).toBe(1);
		expect(diffBody.data.diff.files[0].status).toBe("modified");

		// Compare default→main (empty) and main→a made-up range (c1→c2).
		const cmpRes = await app.request(`${baseUrl}/compare?from=${c1}&to=${c2}`);
		expect(cmpRes.status).toBe(200);
		const cmpBody = (await cmpRes.json()) as any;
		expect(cmpBody.data.diff.stats.files).toBe(1);

		// Branches list + create + delete via HTTP.
		const brRes = await app.request(`${baseUrl}/branches`);
		expect(brRes.status).toBe(200);
		const brBody = (await brRes.json()) as any;
		expect(brBody.data.branches.map((b: any) => b.name)).toEqual(["main"]);
		expect(brBody.data.total).toBe(1);
		const createRes = await app.request(`${baseUrl}/branches`, {
			method: "POST",
			body: new URLSearchParams({ name: "feature", from: "main" }),
		});
		expect(createRes.status).toBe(200);
		const after = await listBranches(gitBackend.fsFor(OWNER, REPO), gitBackend.gitdirFor(OWNER, REPO));
		expect(after.branches.map((b) => b.name)).toContain("feature");

		// Tags: create annotated + list via HTTP.
		const tagRes = await app.request(`${baseUrl}/tags`, {
			method: "POST",
			body: new URLSearchParams({
				name: "v2.0",
				target: "main",
				message: "release v2",
				taggerName: OWNER,
				taggerEmail: "owner@example.com",
			}),
		});
		expect(tagRes.status).toBe(200);
		const tagCreate = (await tagRes.json()) as any;
		expect(tagCreate.data.tag.type).toBe("annotated");
		const tagListRes = await app.request(`${baseUrl}/tags`);
		expect(tagListRes.status).toBe(200);
		const tagList = ((await tagListRes.json()) as any).data.tags;
		expect(tagList.map((t: any) => t.name)).toContain("v2.0");
		expect(tagList.find((t: any) => t.name === "v2.0").type).toBe("annotated");
	} finally {
		try {
			await db?.$client?.close?.();
		} catch {}
		rmSync(base, { recursive: true, force: true });
	}
});

function reqBody(body: any): BodyInit | undefined {
	// isomorphic-git hands us the POST body as an ARRAY of Uint8Array pkt-lines
	// (command lines + packfile). Buffer.from(arrayOfTypedArrays) would corrupt
	// it, so flatten to a single Buffer first (mirrors git.e2e.test.ts).
	if (body == null) return undefined;
	if (Array.isArray(body)) return Buffer.concat(body.map((b: any) => Buffer.from(b)));
	if (body instanceof Uint8Array) return body;
	return Buffer.from(body);
}

function makeHttp(app: Hono) {
	return {
		async request({ url, method = "GET", headers = {}, body }: any) {
			const res = await app.request(
				new Request(url, {
					method,
					headers: new Headers(headers),
					body: reqBody(body),
				}),
			);
			const buf = new Uint8Array(await res.arrayBuffer());
			return {
				statusCode: res.status,
				statusMessage: res.statusText,
				headers: Object.fromEntries(res.headers.entries()),
				body: new ReadableStream<Uint8Array>({
					start(controller) {
						if (buf.length) controller.enqueue(buf);
						controller.close();
					},
				}),
			};
		},
	};
}
