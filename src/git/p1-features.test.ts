/**
 * P1 features e2e — archive (P1-3) + commit search / file history (P1-4) +
 * blame (P1-5), at both the module level and through the `/api/page/...`
 * endpoints. Self-contained (its own seed/buildApp/commitAll) so it does not
 * collide with the read-layer test file.
 *
 * Asserts:
 *   - archiveRepo emits a valid ZIP (PK magic, unzips to the tree) and tar.gz
 *     (gzip that decompresses to a tar containing the filenames)
 *   - searchCommits filters by message / author; commitsForPath lists the
 *     commits that touched a path (including the delete commit)
 *   - blameFile attributes each line to the commit that last touched it
 *   - the endpoints in buildQueryApp route those same operations (200 + shape)
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
import { archiveRepo } from "@/git/archive";
import { searchCommits, commitsForPath, aheadBehind } from "@/git/search";
import { blameFile } from "@/git/blame";

const OWNER_ID = "00000000-0000-0000-0000-0000000000aa";
const REPO_ID = "11111111-1111-1111-1111-1111111111bb";
const OWNER = "owner";
const REPO = "repo";
const AUTHOR = { name: OWNER, email: "owner@example.com" };

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

/** Commit a set of {path → content} changes in one commit; returns its oid. */
async function commitAll(fs: any, dir: string, message: string, changes: Record<string, string>): Promise<string> {
	for (const [path, content] of Object.entries(changes)) {
		if (content === "") {
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

/** Build a local repo with a 3-commit history touching multiple files. */
async function makeHistory(): Promise<{ base: string; dir: string; fs: any; gitdir: string; c1: string; c2: string; c3: string }> {
	const base = mkdtempSync(join(tmpdir(), "cf-p1feat-"));
	const dir = join(base, "repo");
	const fs = nodeFs();
	await git.init({ fs, dir, defaultBranch: "main" });
	const c1 = await commitAll(fs, dir, "c1 add readme + a + b", {
		"README.md": "# Hello\n",
		"src/a.txt": "a\n",
		"src/b.txt": "b\n",
	});
	const c2 = await commitAll(fs, dir, "c2 edit readme, add c, del b", {
		"README.md": "# Hello\nmore\n",
		"src/c.txt": "c\n",
		"src/b.txt": "",
	});
	const c3 = await commitAll(fs, dir, "c3 edit a", { "src/a.txt": "a\nchanged\n" });
	return { base, dir, fs, gitdir: join(dir, ".git"), c1, c2, c3 };
}

// ---------------------------------------------------------------------------
// Module-level tests
// ---------------------------------------------------------------------------

test("P1-4 · searchCommits filters by message and author", async () => {
	const { gitdir, fs } = await makeHistory();
	const byMsg = await searchCommits(fs, gitdir, "main", { query: "c2" });
	expect(byMsg.total).toBe(1);
	expect(byMsg.commits[0].message).toContain("c2");

	const edits = await searchCommits(fs, gitdir, "main", { query: "edit" });
	expect(edits.total).toBe(2); // c2 + c3

	const byAuthor = await searchCommits(fs, gitdir, "main", { author: "owner" });
	expect(byAuthor.total).toBe(3); // all three

	const none = await searchCommits(fs, gitdir, "main", { query: "nope" });
	expect(none.total).toBe(0);
});

test("P1-4 · commitsForPath lists commits touching a path (incl. delete)", async () => {
	const { gitdir, fs } = await makeHistory();
	const readme = await commitsForPath(fs, gitdir, "main", "README.md");
	expect(readme.total).toBe(2); // c1 (add) + c2 (edit)

	const deleted = await commitsForPath(fs, gitdir, "main", "src/b.txt");
	expect(deleted.total).toBe(2); // c1 (add) + c2 (delete)

	const untouched = await commitsForPath(fs, gitdir, "main", "src/c.txt");
	expect(untouched.total).toBe(1); // only c2 (add)
});

test("P1-5 · blameFile attributes each line to its last-touching commit", async () => {
	const { gitdir, fs, c1, c2, c3 } = await makeHistory();
	const readme = await blameFile(fs, gitdir, "main", "README.md");
	// c1: "# Hello", c2 adds "more" → line 2 is c2's.
	expect(readme.lines.length).toBe(2);
	expect(readme.lines[0]!.oid).toBe(c1);
	expect(readme.lines[1]!.oid).toBe(c2);

	const a = await blameFile(fs, gitdir, "main", "src/a.txt");
	// c1: "a", c3 changes line 2 → line 2 is c3's.
	expect(a.lines.length).toBe(2);
	expect(a.lines[0]!.oid).toBe(c1);
	expect(a.lines[1]!.oid).toBe(c3);
});

test("P1-3 · archiveRepo emits valid ZIP and tar.gz", async () => {
	const { gitdir, fs } = await makeHistory();

	// ZIP — PK\x03\x04 local-file-header magic; decompresses to the tree.
	const zip = await archiveRepo(fs, gitdir, "main", "zip", "repo");
	expect(zip.contentType).toBe("application/zip");
	expect(zip.filename).toBe("repo-main.zip");
	expect(zip.body[0]).toBe(0x50); // 'P'
	expect(zip.body[1]).toBe(0x4b); // 'K'
	expect(zip.body[2]).toBe(0x03);
	expect(zip.body[3]).toBe(0x04);
	// Every tracked file appears as a zip entry name.
	const zipText = new TextDecoder().decode(zip.body);
	expect(zipText).toContain("README.md");
	expect(zipText).toContain("src/a.txt");
	expect(zipText).toContain("src/c.txt");
	expect(zipText).not.toContain("src/b.txt"); // deleted in c2

	// tar.gz — gzip that decompresses to a tar whose header names the files.
	const tgz = await archiveRepo(fs, gitdir, "main", "tar.gz", "repo");
	expect(tgz.contentType).toBe("application/gzip");
	expect(tgz.filename).toBe("repo-main.tar.gz");
	const ds = new DecompressionStream("gzip");
	const writer = ds.writable.getWriter();
	await writer.write(tgz.body);
	await writer.close();
	const tar = new Uint8Array(await new Response(ds.readable).arrayBuffer());
	const tarText = new TextDecoder().decode(tar);
	expect(tarText).toContain("README.md");
	expect(tarText).toContain("src/a.txt");
});

test("P1-2/4 · aheadBehind counts divergence between two refs", async () => {
	const { gitdir, fs, c2 } = await makeHistory();
	const dir = gitdir.replace(/\.git$/, "");
	// Branch `feature` off c2 (before c3 landed on main), then add a feature-only
	// commit ON feature. `git.branch` doesn't move HEAD, so create the ref
	// explicitly and check it out first. Now main has c3 (ahead of feature) and
	// feature has feat1 (behind main) → ahead=1, behind=1.
	await git.writeRef({ fs, dir, ref: "refs/heads/feature", value: c2 });
	await git.checkout({ fs, dir, ref: "feature" });
	await commitAll(fs, dir, "feat1 feature only", { "src/feat.txt": "x\n" });
	const ab = await aheadBehind(fs, gitdir, "feature", "main");
	expect(ab.ahead).toBe(1); // c3 on main
	expect(ab.behind).toBe(1); // feat1 on feature
});

// ---------------------------------------------------------------------------
// HTTP endpoint tests (push to the real backend, then hit the read API)
// ---------------------------------------------------------------------------

function reqBody(body: any): BodyInit | undefined {
	// isomorphic-git hands us the POST body as an ARRAY of Uint8Array pkt-lines.
	// Buffer.concat on the raw elements corrupts it (each coerced to a code
	// point), so flatten to a single Buffer first.
	if (body == null) return undefined;
	if (Array.isArray(body)) return Buffer.concat(body.map((b: any) => Buffer.from(b)));
	if (body instanceof Uint8Array) return body;
	return Buffer.from(body);
}

function makeHttp(app: Hono, defaultHeaders: Record<string, string> = {}) {
	return {
		async request({ url, method, headers, body }: any) {
			const req = new Request(url, {
				method,
				headers: new Headers({ ...defaultHeaders, ...(headers ?? {}) }),
				body: reqBody(body),
			});
			const res = await app.request(req);
			const buf = new Uint8Array(await res.arrayBuffer());
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					if (buf.length) controller.enqueue(buf);
					controller.close();
				},
			});
			return {
				statusCode: res.status,
				statusMessage: res.statusText,
				headers: Object.fromEntries(res.headers.entries()),
				body: stream,
			};
		},
	};
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
	mountGitRoutes(app, { db, gitBackend });
	return app;
}

test("P1-3/4/5 · archive + search + blame + ahead-behind endpoints (HTTP)", async () => {
	const base = mkdtempSync(join(tmpdir(), "cf-p1feat-http-"));
	const gitRoot = join(base, "gitdata");
	const clientRepo = join(base, "client");
	let db: any = null;
	try {
		const dbFile = join(base, "test.db");
		const target = resolveDatabaseTarget(`file:${dbFile}`, "sqlite");
		db = await createQueryDb(target);
		await seed(db);
		const gitBackend = localGitBackend(gitRoot);
		const clientFs = nodeFs();
		const queue = { send: async () => {} };
		const http = makeHttp(await buildApp(db, gitBackend, queue as any));

		await git.init({ fs: clientFs, dir: clientRepo, defaultBranch: "main" });
		await commitAll(clientFs, clientRepo, "c1 add readme + a + b", {
			"README.md": "# Hello\n",
			"src/a.txt": "a\n",
			"src/b.txt": "b\n",
		});
		await commitAll(clientFs, clientRepo, "c2 edit readme, add c, del b", {
			"README.md": "# Hello\nmore\n",
			"src/c.txt": "c\n",
			"src/b.txt": "",
		});
		await commitAll(clientFs, clientRepo, "c3 edit a", { "src/a.txt": "a\nchanged\n" });
		await git.push({ fs: clientFs, http, dir: clientRepo, url: `http://localhost/${OWNER}/${REPO}.git`, ref: "main" });

		const app = await buildApp(db, gitBackend);

		// Archive (zip).
		const zipRes = await app.request(new Request(`http://localhost/api/page/repositories/${REPO_ID}/archive?format=zip`));
		expect(zipRes.status).toBe(200);
		expect(zipRes.headers.get("content-type") ?? "").toContain("application/zip");
		const zipBuf = new Uint8Array(await zipRes.arrayBuffer());
		expect(zipBuf[0]).toBe(0x50);

		// Archive (tar.gz).
		const tgzRes = await app.request(new Request(`http://localhost/api/page/repositories/${REPO_ID}/archive?format=tar.gz`));
		expect(tgzRes.status).toBe(200);
		expect(tgzRes.headers.get("content-type") ?? "").toContain("application/gzip");

		// Commit search.
		const searchRes = await app.request(new Request(`http://localhost/api/page/repositories/${REPO_ID}/commits/search?q=c2`));
		expect(searchRes.status).toBe(200);
		const searchJson = await searchRes.json();
		expect(searchJson.data.total).toBe(1);
		expect(searchJson.data.commits[0].message).toContain("c2");

		// File history for README.md.
		const histRes = await app.request(new Request(`http://localhost/api/page/repositories/${REPO_ID}/commits/for-path?path=README.md`));
		expect(histRes.status).toBe(200);
		const histJson = await histRes.json();
		expect(histJson.data.total).toBe(2);

		// Blame README.md — line 2 attributed to the commit that added "more".
		const blameRes = await app.request(new Request(`http://localhost/api/page/repositories/${REPO_ID}/blame?path=README.md`));
		expect(blameRes.status).toBe(200);
		const blameJson = await blameRes.json();
		expect(blameJson.data.lines.length).toBe(2);
		expect(blameJson.data.lines[1].message).toContain("c2");

		// ahead-behind.
		const abRes = await app.request(new Request(`http://localhost/api/page/repositories/${REPO_ID}/ahead-behind?base=main&head=main`));
		expect(abRes.status).toBe(200);
		const abJson = await abRes.json();
		expect(abJson.data.ahead).toBe(0);
		expect(abJson.data.behind).toBe(0);
	} finally {
		try {
			await db?.$client?.close?.();
		} catch {}
		rmSync(base, { recursive: true, force: true });
	}
});
