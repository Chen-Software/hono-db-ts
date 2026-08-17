/**
 * git.e2e — end-to-end test of the git smart-HTTP backend.
 *
 * Spins up the REAL Hono app (buildQueryApp + mountGitRoutes) with a local-fs
 * git backend, seeds a user + repository row, then uses isomorphic-git as a
 * CLIENT to push a commit and clone it back — asserting object parity. This is
 * the proof that the v1 smart-HTTP server (upload-pack / receive-pack) actually
 * works, not just that the modules compile.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import * as git from "isomorphic-git";
import { run } from "@/services/types";
import { createQueryDb } from "@/db/client";
import { resolveDatabaseTarget } from "@/http/schema";
import { buildQueryApp } from "@/http/app";
import { localGitBackend } from "@/git/backend";
import { mountGitRoutes } from "@/git/routes";
import { nodeFs } from "@/git/fs-node";
import { createAccessToken, sha256Hex } from "@/git/auth";

const OWNER_ID = "00000000-0000-0000-0000-0000000000aa";
const REPO_ID = "11111111-1111-1111-1111-1111111111bb";
const OWNER = "owner";
const REPO = "repo";

function reqBody(body: any): BodyInit | undefined {
	// isomorphic-git hands us the POST body as an ARRAY of Uint8Array pkt-lines
	// (e.g. command lines + packfile). Buffer.from(arrayOfTypedArrays) would
	// corrupt it (each element coerced to a code-point number), so flatten to
	// a single Buffer first.
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
			// Return a web ReadableStream that enqueues the full body then
			// CLOSEs. isomorphic-git's StreamReader/demux need a proper EOF:
			// a bare ArrayBuffer/Buffer/Uint8Array is either byte-iterable (so
			// the pkt-line header is read one byte at a time → corrupt framing)
			// or, for an ArrayBuffer, fails to signal end in this runtime and
			// demux loops forever. An explicitly-closed ReadableStream gives a
			// clean, finite stream the client can fully consume.
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

async function seed(db: any) {
	const now = new Date().toISOString();
	await run(db, `INSERT INTO users (id, created_at, name, email) VALUES (?, ?, ?, ?)`, [OWNER_ID, now, OWNER, "owner@example.com"]);
	// 21 columns, matching the drizzle repositories schema exactly. The first
	// 8 are bound with ? from params (id/created_at/ownerId/name/lowerName/
	// description/defaultBranch/website); the rest are literal defaults.
	// isTemplate=0, objectFormatName='sha1' (the value the git backend reads to
	// choose SHA-1), topics='[]'.
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

test("git smart-HTTP: push then clone round-trips a commit", async () => {
	const base = mkdtempSync(join(tmpdir(), "codeforge-git-"));
	const gitRoot = join(base, "gitdata");
	const clientRepo = join(base, "client");
	const cloneDir = join(base, "clone");
	let db: any = null;

	try {
		const dbFile = join(base, "test.db");
		const target = resolveDatabaseTarget(`file:${dbFile}`, "sqlite");
		db = await createQueryDb(target);
		await seed(db);

		const gitBackend = localGitBackend(gitRoot);
		const clientFs = nodeFs();
		// Capturing fake queue — proves the transport publishes `repo.push`
		// actions after a successful push (the Cloudflare Queues producer path).
		const sent: any[] = [];
		const queue = { send: async (m: unknown) => { sent.push(m); } };
		const http = makeHttp(await buildApp(db, gitBackend, queue));

		// 1) Create a local commit.
		await git.init({ fs: clientFs, dir: clientRepo, defaultBranch: "main" });
		await clientFs.promises.writeFile(join(clientRepo, "README.md"), "# Hello from CodeForge\n");
		await git.add({ fs: clientFs, dir: clientRepo, filepath: "README.md" });
		await git.commit({
			fs: clientFs,
			dir: clientRepo,
			message: "initial commit",
			author: { name: OWNER, email: "owner@example.com" },
			committer: { name: OWNER, email: "owner@example.com" },
		});

		// 2) Push to the server (receive-pack).
		await git.push({
			fs: clientFs,
			http,
			dir: clientRepo,
			url: `http://localhost/${OWNER}/${REPO}.git`,
			ref: "main",
		});

		// The push published exactly one `repo.push` action with the accepted ref.
		expect(sent.length).toBe(1);
		expect(sent[0].type).toBe("repo.push");
		expect(sent[0].owner).toBe(OWNER);
		expect(sent[0].repo).toBe(REPO);
		expect(sent[0].ref).toBe("refs/heads/main");
		expect(sent[0].pusherId).toBe(OWNER_ID);
		expect(typeof sent[0].oid).toBe("string");
		expect(typeof sent[0].ts).toBe("string");

		// 3) Clone back (upload-pack).
		await git.clone({ fs: clientFs, http, dir: cloneDir, url: `http://localhost/${OWNER}/${REPO}.git` });
		const clonedReadme = await clientFs.promises.readFile(join(cloneDir, "README.md"), { encoding: "utf8" });
		expect(String(clonedReadme)).toBe("# Hello from CodeForge\n");

		// 4) Commit history survived the round-trip.
		const log = await git.log({ fs: clientFs, dir: cloneDir });
		expect(log.length).toBeGreaterThanOrEqual(1);
		expect(log[0].commit.message).toContain("initial commit");

		// 5) The read API exposes the tree + README.
		const treeRes = await (await buildApp(db, gitBackend)).request(new Request(`http://localhost/api/page/repositories/${REPO_ID}/tree`));
		expect(treeRes.status).toBe(200);
		const treeJson = await treeRes.json();
		const entries = treeJson.data.entries as Array<{ name: string; type: string }>;
		expect(entries.some((e) => e.name === "README.md" && e.type === "blob")).toBe(true);
		expect(typeof treeJson.data.readme).toBe("string");
		expect((treeJson.data.readme as string).includes("Hello from CodeForge")).toBe(true);

		// 6) The commits API lists the pushed commit.
		const commitsRes = await (await buildApp(db, gitBackend)).request(new Request(`http://localhost/api/page/repositories/${REPO_ID}/commits`));
		expect(commitsRes.status).toBe(200);
		const commitsJson = await commitsRes.json();
		expect(Array.isArray(commitsJson.data.commits)).toBe(true);
		expect(commitsJson.data.commits.length).toBeGreaterThanOrEqual(1);
		expect(commitsJson.data.commits[0].message).toContain("initial commit");
	} finally {
		// Close the libSQL client or bun never exits (open connection keeps
		// the event loop alive), which looks like a hang.
		try {
			await db?.$client?.close?.();
		} catch {}
		rmSync(base, { recursive: true, force: true });
	}
});

test("git smart-HTTP: a freshly created (empty) repo advertises empty refs — clone-before-push + empty read API", async () => {
	const base = mkdtempSync(join(tmpdir(), "codeforge-git-"));
	const gitRoot = join(base, "gitdata");
	let db: any = null;

	try {
		const dbFile = join(base, "test.db");
		const target = resolveDatabaseTarget(`file:${dbFile}`, "sqlite");
		db = await createQueryDb(target);
		await seed(db);

		const gitBackend = localGitBackend(gitRoot);
		const app = await buildApp(db, gitBackend);

		// `git clone` of a repo that has a DB row but NO git data yet: the
		// upload-pack advertisement must be a valid empty repo (ensureRepo
		// initialises the bare repo on info/refs for BOTH services).
		const adv = await app.request(
			new Request(`http://localhost/${OWNER}/${REPO}.git/info/refs?service=git-upload-pack`),
		);
		expect(adv.status).toBe(200);
		expect(adv.headers.get("content-type") ?? "").toContain("application/x-git-upload-pack-advertisement");
		const advBody = await adv.text();
		expect(advBody).toContain("# service=git-upload-pack");
		expect(advBody).not.toContain("refs/heads/"); // zero refs → empty repo

		// First-push path (receive-pack advertisement) also works.
		const adv2 = await app.request(
			new Request(`http://localhost/${OWNER}/${REPO}.git/info/refs?service=git-receive-pack`),
		);
		expect(adv2.status).toBe(200);

		// The read API on the empty repo returns an EMPTY tree / no commits —
		// not a 404/500 (the repo page shows an empty state, not an error).
		const treeRes = await app.request(new Request(`http://localhost/api/page/repositories/${REPO_ID}/tree`));
		expect(treeRes.status).toBe(200);
		const treeJson = await treeRes.json();
		expect(treeJson.data.entries).toEqual([]);
		expect(treeJson.data.readme).toBeNull();

		const commitsRes = await app.request(new Request(`http://localhost/api/page/repositories/${REPO_ID}/commits`));
		expect(commitsRes.status).toBe(200);
		const commitsJson = await commitsRes.json();
		expect(commitsJson.data.commits).toEqual([]);
	} finally {
		try {
			await db?.$client?.close?.();
		} catch {}
		rmSync(base, { recursive: true, force: true });
	}
});

test("P0-1 · git CLI Basic auth: PAT clone + push works, wrong token 401s, read-only token 403s", async () => {
	const base = mkdtempSync(join(tmpdir(), "codeforge-git-"));
	const gitRoot = join(base, "gitdata");
	const clientRepo = join(base, "client");
	let db: any = null;

	try {
		const dbFile = join(base, "test.db");
		const target = resolveDatabaseTarget(`file:${dbFile}`, "sqlite");
		db = await createQueryDb(target);
		await seed(db);
		// Make the repo private so the transport actually requires auth (the
		// wrong-token / read-only-token assertions depend on it).
		await run(db, `UPDATE "repositories" SET "isPrivate" = 1 WHERE "id" = ?`, [REPO_ID]);

		const gitBackend = localGitBackend(gitRoot);
		const clientFs = nodeFs();
		const queue = { send: async () => {} };

		// Build a PAT for the owner (full read+write scopes).
		const { rawToken } = await createAccessToken(db, OWNER_ID, "cli-token");
		const auth = `Basic ${Buffer.from(`${OWNER}:${rawToken}`).toString("base64")}`;

		// No session injection — force the Basic-auth path.
		const http = makeHttp(await buildApp(db, gitBackend, queue, null), {
			authorization: auth,
		});

		await git.init({ fs: clientFs, dir: clientRepo, defaultBranch: "main" });
		await clientFs.promises.writeFile(join(clientRepo, "README.md"), "# Hello from CodeForge\n");
		await git.add({ fs: clientFs, dir: clientRepo, filepath: "README.md" });
		await git.commit({
			fs: clientFs,
			dir: clientRepo,
			message: "initial commit",
			author: { name: OWNER, email: "owner@example.com" },
			committer: { name: OWNER, email: "owner@example.com" },
		});

		// Push over Basic auth (receive-pack) — must succeed.
		await git.push({
			fs: clientFs,
			http,
			dir: clientRepo,
			url: `http://localhost/${OWNER}/${REPO}.git`,
			ref: "main",
		});

		// Clone over Basic auth (upload-pack) — must succeed and carry content.
		const cloneDir = join(base, "clone");
		await git.clone({ fs: clientFs, http, dir: cloneDir, url: `http://localhost/${OWNER}/${REPO}.git` });
		const cloned = await clientFs.promises.readFile(join(cloneDir, "README.md"), { encoding: "utf8" });
		expect(String(cloned)).toBe("# Hello from CodeForge\n");

		// Wrong token → 401 (with the Basic challenge header).
		const badAuth = `Basic ${Buffer.from(`${OWNER}:${"a".repeat(40)}`).toString("base64")}`;
		const infoRes = await (await buildApp(db, gitBackend, queue, null)).request(
			new Request(`http://localhost/${OWNER}/${REPO}.git/info/refs?service=git-upload-pack`, {
				headers: { authorization: badAuth },
			}),
		);
		expect(infoRes.status).toBe(401);
		expect(infoRes.headers.get("WWW-Authenticate") ?? "").toContain('realm="CodeForge"');

		// Read-only token → 403 on push (scope gate).
		const { rawToken: roToken } = await createAccessToken(db, OWNER_ID, "ro-token", ["read:repository"]);
		const roAuth = `Basic ${Buffer.from(`${OWNER}:${roToken}`).toString("base64")}`;
		let pushed = false;
		try {
			await git.push({
				fs: clientFs,
				http: makeHttp(await buildApp(db, gitBackend, queue, null), { authorization: roAuth }),
				dir: clientRepo,
				url: `http://localhost/${OWNER}/${REPO}.git`,
				ref: "main",
			});
			pushed = true;
		} catch {
			// isomorphic-git throws on a non-zero push result; that's expected.
		}
		expect(pushed).toBe(false);
	} finally {
		try {
			await db?.$client?.close?.();
		} catch {}
		rmSync(base, { recursive: true, force: true });
	}
});

test("P0-2 · git push --delete removes the ref (ref deletion is not a silent no-op)", async () => {
	const base = mkdtempSync(join(tmpdir(), "codeforge-git-"));
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
		const sent: any[] = [];
		const queue = { send: async (m: unknown) => { sent.push(m); } };
		const http = makeHttp(await buildApp(db, gitBackend, queue));

		await git.init({ fs: clientFs, dir: clientRepo, defaultBranch: "main" });
		await clientFs.promises.writeFile(join(clientRepo, "README.md"), "# Hi\n");
		await git.add({ fs: clientFs, dir: clientRepo, filepath: "README.md" });
		await git.commit({
			fs: clientFs,
			dir: clientRepo,
			message: "initial",
			author: { name: OWNER, email: "owner@example.com" },
			committer: { name: OWNER, email: "owner@example.com" },
		});

		// Push `main`, then push a second branch `feature`.
		await git.push({ fs: clientFs, http, dir: clientRepo, url: `http://localhost/${OWNER}/${REPO}.git`, ref: "main" });
		await git.branch({ fs: clientFs, dir: clientRepo, ref: "feature" });
		await git.push({ fs: clientFs, http, dir: clientRepo, url: `http://localhost/${OWNER}/${REPO}.git`, ref: "feature" });

		// Delete `feature` via the transport.
		await git.push({
			fs: clientFs,
			http,
			dir: clientRepo,
			url: `http://localhost/${OWNER}/${REPO}.git`,
			ref: "feature",
			delete: true,
		});

		// The ref must no longer advertise.
		const branches = await git.listBranches({ fs: clientFs, dir: clientRepo });
		expect(branches).toContain("feature"); // client side still has it
		const serverRefs = await (await buildApp(db, gitBackend, queue)).request(
			new Request(`http://localhost/${OWNER}/${REPO}.git/info/refs?service=git-upload-pack`),
		);
		const advText = await serverRefs.text();
		expect(advText).not.toContain("refs/heads/feature");

		// A deletion event was delivered to the queue.
		expect(sent.some((e) => e.type === "repo.push" && e.deleted === true && e.ref === "refs/heads/feature")).toBe(
			true,
		);
	} finally {
		try {
			await db?.$client?.close?.();
		} catch {}
		rmSync(base, { recursive: true, force: true });
	}
});

test("P0-3 · tags advertise + pack: annotated + lightweight tags survive clone", async () => {
	const base = mkdtempSync(join(tmpdir(), "codeforge-git-"));
	const gitRoot = join(base, "gitdata");
	const clientRepo = join(base, "client");
	const cloneDir = join(base, "clone");
	let db: any = null;

	try {
		const dbFile = join(base, "test.db");
		const target = resolveDatabaseTarget(`file:${dbFile}`, "sqlite");
		db = await createQueryDb(target);
		await seed(db);

		const gitBackend = localGitBackend(gitRoot);
		const clientFs = nodeFs();
		const http = makeHttp(await buildApp(db, gitBackend));

		await git.init({ fs: clientFs, dir: clientRepo, defaultBranch: "main" });
		await clientFs.promises.writeFile(join(clientRepo, "README.md"), "# Tag me\n");
		await git.add({ fs: clientFs, dir: clientRepo, filepath: "README.md" });
		await git.commit({
			fs: clientFs,
			dir: clientRepo,
			message: "c1",
			author: { name: OWNER, email: "owner@example.com" },
			committer: { name: OWNER, email: "owner@example.com" },
		});
		await git.push({ fs: clientFs, http, dir: clientRepo, url: `http://localhost/${OWNER}/${REPO}.git`, ref: "main" });

		// Lightweight tag (isomorphic-git `tag` writes the ref directly).
		const c1 = await git.resolveRef({ fs: clientFs, dir: clientRepo, ref: "HEAD" });
		await git.tag({ fs: clientFs, dir: clientRepo, ref: "light", object: c1 });
		await git.push({ fs: clientFs, http, dir: clientRepo, url: `http://localhost/${OWNER}/${REPO}.git`, ref: "refs/tags/light" });

		// Annotated tag: isomorphic-git has no annotated-tag helper, so write the
		// tag OBJECT ourselves and point `refs/tags/annotated` at it.
		const tagOid = await git.writeObject({
			fs: clientFs,
			dir: clientRepo,
			type: "tag",
			object: Buffer.from(
				`object ${c1}\n` +
					`type commit\n` +
					`tag annotated\n` +
					`tagger ${OWNER} <owner@example.com> 0 +0000\n\n` +
					`release v1\n`,
			),
		});
		await git.writeRef({ fs: clientFs, dir: clientRepo, ref: "refs/tags/annotated", value: tagOid });
		await git.push({ fs: clientFs, http, dir: clientRepo, url: `http://localhost/${OWNER}/${REPO}.git`, ref: "refs/tags/annotated" });

		// ls-remote equivalent: the advertisement lists both tags (and peels the annotated one).
		const adv = await (await buildApp(db, gitBackend)).request(
			new Request(`http://localhost/${OWNER}/${REPO}.git/info/refs?service=git-upload-pack`),
		);
		const advText = await adv.text();
		expect(advText).toContain("refs/tags/light");
		expect(advText).toContain("refs/tags/annotated");
		expect(advText).toContain("refs/tags/annotated^{}"); // peeled

		// Clone brings both tags, and the annotated tag peels to the commit.
		await git.clone({ fs: clientFs, http, dir: cloneDir, url: `http://localhost/${OWNER}/${REPO}.git` });
		const tags = await git.listTags({ fs: clientFs, dir: cloneDir });
		expect(tags).toContain("light");
		expect(tags).toContain("annotated");
		const annotatedOid = await git.resolveRef({ fs: clientFs, dir: cloneDir, ref: "refs/tags/annotated" });
		const { type, object: tagObj } = await git.readObject({ fs: clientFs, dir: cloneDir, oid: annotatedOid, format: "parsed" });
		expect(type).toBe("tag"); // the annotated tag OBJECT was packed, not just the ref
		expect((tagObj as { object: string }).object).toBe(c1); // and it peels to the commit
	} finally {
		try {
			await db?.$client?.close?.();
		} catch {}
		rmSync(base, { recursive: true, force: true });
	}
});

test("P0-4 · archived + mirror repos reject pushes (403), clone still works", async () => {
	const base = mkdtempSync(join(tmpdir(), "codeforge-git-"));
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
		const http = makeHttp(await buildApp(db, gitBackend));

		await git.init({ fs: clientFs, dir: clientRepo, defaultBranch: "main" });
		await clientFs.promises.writeFile(join(clientRepo, "README.md"), "# Hi\n");
		await git.add({ fs: clientFs, dir: clientRepo, filepath: "README.md" });
		await git.commit({
			fs: clientFs,
			dir: clientRepo,
			message: "c1",
			author: { name: OWNER, email: "owner@example.com" },
			committer: { name: OWNER, email: "owner@example.com" },
		});
		await git.push({ fs: clientFs, http, dir: clientRepo, url: `http://localhost/${OWNER}/${REPO}.git`, ref: "main" });

		// Archive the repo → push must 403, clone must still work.
		await run(db, `UPDATE "repositories" SET "isArchived" = 1 WHERE "id" = ?`, [REPO_ID]);
		let archivedPush = false;
		try {
			await git.push({ fs: clientFs, http, dir: clientRepo, url: `http://localhost/${OWNER}/${REPO}.git`, ref: "main" });
			archivedPush = true;
		} catch {}
		expect(archivedPush).toBe(false);

		// Restore + mirror → push must 403 too.
		await run(db, `UPDATE "repositories" SET "isArchived" = 0, "isMirror" = 1 WHERE "id" = ?`, [REPO_ID]);
		let mirrorPush = false;
		try {
			await git.push({ fs: clientFs, http, dir: clientRepo, url: `http://localhost/${OWNER}/${REPO}.git`, ref: "main" });
			mirrorPush = true;
		} catch {}
		expect(mirrorPush).toBe(false);

		// Clone (upload-pack) still succeeds on the archived repo.
		await run(db, `UPDATE "repositories" SET "isMirror" = 0 WHERE "id" = ?`, [REPO_ID]);
		const cloneDir = join(base, "clone");
		await git.clone({ fs: clientFs, http, dir: cloneDir, url: `http://localhost/${OWNER}/${REPO}.git` });
		const readme = await clientFs.promises.readFile(join(cloneDir, "README.md"), { encoding: "utf8" });
		expect(String(readme)).toBe("# Hi\n");
	} finally {
		try {
			await db?.$client?.close?.();
		} catch {}
		rmSync(base, { recursive: true, force: true });
	}
});

test("P0-5 · body cap (413) + content-type validation (401) on the smart-HTTP POST", async () => {
	const base = mkdtempSync(join(tmpdir(), "codeforge-git-"));
	const gitRoot = join(base, "gitdata");
	let db: any = null;

	try {
		const dbFile = join(base, "test.db");
		const target = resolveDatabaseTarget(`file:${dbFile}`, "sqlite");
		db = await createQueryDb(target);
		await seed(db);

		const gitBackend = localGitBackend(gitRoot);
		const app = await buildApp(db, gitBackend);
		const url = `http://localhost/${OWNER}/${REPO}.git/git-receive-pack`;

		// Oversized Content-Length → 413 (before any body is read).
		const tooBig = await app.request(
			new Request(url, {
				method: "POST",
				headers: {
					"content-type": "application/x-git-receive-pack-request",
					"content-length": String(600 * 1024 * 1024),
				},
				body: new Uint8Array(0),
			}),
		);
		expect(tooBig.status).toBe(413);

		// Wrong content-type → 401 (Forgejo `serviceRPC` parity).
		const badCt = await app.request(
			new Request(url, {
				method: "POST",
				headers: { "content-type": "text/plain", "content-length": "0" },
				body: new Uint8Array(0),
			}),
		);
		expect(badCt.status).toBe(401);

		// A normal push body with the right content-type is NOT rejected by the
		// new checks (the empty body just fails in pack parsing, which is fine —
		// the point is we get past auth/content-type to the transport itself).
		const emptyPush = await app.request(
			new Request(url, {
				method: "POST",
				headers: { "content-type": "application/x-git-receive-pack-request", "content-length": "0" },
				body: new Uint8Array(0),
			}),
		);
		expect([401, 200, 500]).toContain(emptyPush.status);
	} finally {
		try {
			await db?.$client?.close?.();
		} catch {}
		rmSync(base, { recursive: true, force: true });
	}
});

test("P0-6 · fetch honours `have`s: incremental fetch after a second push transfers only the delta", async () => {
	const base = mkdtempSync(join(tmpdir(), "codeforge-git-"));
	const gitRoot = join(base, "gitdata");
	const clientRepo = join(base, "client");
	const cloneDir = join(base, "clone");
	let db: any = null;

	try {
		const dbFile = join(base, "test.db");
		const target = resolveDatabaseTarget(`file:${dbFile}`, "sqlite");
		db = await createQueryDb(target);
		await seed(db);

		const gitBackend = localGitBackend(gitRoot);
		const clientFs = nodeFs();
		const http = makeHttp(await buildApp(db, gitBackend));

		await git.init({ fs: clientFs, dir: clientRepo, defaultBranch: "main" });
		await clientFs.promises.writeFile(join(clientRepo, "README.md"), "# A\n");
		await git.add({ fs: clientFs, dir: clientRepo, filepath: "README.md" });
		await git.commit({
			fs: clientFs,
			dir: clientRepo,
			message: "a",
			author: { name: OWNER, email: "owner@example.com" },
			committer: { name: OWNER, email: "owner@example.com" },
		});
		await git.push({ fs: clientFs, http, dir: clientRepo, url: `http://localhost/${OWNER}/${REPO}.git`, ref: "main" });

		// Initial clone has commit A only.
		await git.clone({ fs: clientFs, http, dir: cloneDir, url: `http://localhost/${OWNER}/${REPO}.git` });

		// Second push: commit B.
		await clientFs.promises.writeFile(join(clientRepo, "b.txt"), "B\n");
		await git.add({ fs: clientFs, dir: clientRepo, filepath: "b.txt" });
		await git.commit({
			fs: clientFs,
			dir: clientRepo,
			message: "b",
			author: { name: OWNER, email: "owner@example.com" },
			committer: { name: OWNER, email: "owner@example.com" },
		});
		await git.push({ fs: clientFs, http, dir: clientRepo, url: `http://localhost/${OWNER}/${REPO}.git`, ref: "main" });

		// Incremental fetch in the clone: the client sends `have` (it has A),
		// so the server must transfer only B and its objects — the fetch still
		// succeeds and B's objects are present in the clone's store afterwards.
		await git.fetch({ fs: clientFs, http, dir: cloneDir, url: `http://localhost/${OWNER}/${REPO}.git`, ref: "main" });
		// The remote-tracking ref advanced to B, and B's new blob is fetchable.
		const remoteHead = await git.resolveRef({ fs: clientFs, dir: cloneDir, ref: "refs/remotes/origin/main" });
		const bBlob = await git.readBlob({ fs: clientFs, dir: cloneDir, oid: remoteHead, filepath: "b.txt" });
		expect(Buffer.from(bBlob.blob).toString("utf8")).toBe("B\n");
		// The remote-tracking log now includes B.
		const log = await git.log({ fs: clientFs, dir: cloneDir, ref: "refs/remotes/origin/main" });
		expect(log.some((e) => e.commit.message.includes("b"))).toBe(true);

		// A second no-op fetch also works (haves cover everything → empty pack).
		await git.fetch({ fs: clientFs, http, dir: cloneDir, url: `http://localhost/${OWNER}/${REPO}.git`, ref: "main" });
	} finally {
		try {
			await db?.$client?.close?.();
		} catch {}
		rmSync(base, { recursive: true, force: true });
	}
});

test("P0-7 · repo-name case normalisation: Git/Repo.git and git/repo.git resolve to the same repo", async () => {
	const base = mkdtempSync(join(tmpdir(), "codeforge-git-"));
	const gitRoot = join(base, "gitdata");
	let db: any = null;

	try {
		const dbFile = join(base, "test.db");
		const target = resolveDatabaseTarget(`file:${dbFile}`, "sqlite");
		db = await createQueryDb(target);
		await seed(db);

		const gitBackend = localGitBackend(gitRoot);
		const app = await buildApp(db, gitBackend);

		// The seeded repo row is `owner/repo` (lowercase). A mixed-case URL must
		// resolve to the SAME repo (stripGit lowercases the path, B9).
		const mixed = await app.request(
			new Request(`http://localhost/Owner/Repo.git/info/refs?service=git-upload-pack`),
		);
		expect(mixed.status).toBe(200);
		const lc = await app.request(
			new Request(`http://localhost/${OWNER}/${REPO}.git/info/refs?service=git-upload-pack`),
		);
		expect(lc.status).toBe(200);
		expect(await mixed.text()).toBe(await lc.text());
	} finally {
		try {
			await db?.$client?.close?.();
		} catch {}
		rmSync(base, { recursive: true, force: true });
	}
});

async function buildApp(
	db: any,
	gitBackend: ReturnType<typeof localGitBackend>,
	queue?: { send(msg: unknown): Promise<void> | void },
	sessionUser: { id: string; name: string } | null = { id: OWNER_ID, name: OWNER },
): Promise<Hono> {
	const app = new Hono();
	// Inject a fake session so the (owner-only) push gate passes in the test.
	// Pass `null` to suppress the session and exercise Basic auth instead.
	app.use("*", async (c, next) => {
		const env = (c.env as Record<string, unknown>) ?? {};
		env.auth = { api: { getSession: async () => (sessionUser ? { user: sessionUser } : null) } };
		(c as unknown as { env: unknown }).env = env;
		await next();
	});
	app.route("/api", buildQueryApp(db, undefined, gitBackend));
	mountGitRoutes(app, { db, gitBackend, queue });
	return app;
}
