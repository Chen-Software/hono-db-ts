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

function makeHttp(app: Hono) {
	return {
		async request({ url, method, headers, body }: any) {
			const req = new Request(url, {
				method,
				headers: new Headers(headers),
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
	await run(db, `INSERT INTO users (id, created_at, name, email, role, age) VALUES (?, ?, ?, ?, ?, ?)`, [OWNER_ID, now, OWNER, "owner@example.com", "admin", 30]);
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
		const http = makeHttp(await buildApp(db, gitBackend));

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

async function buildApp(db: any, gitBackend: ReturnType<typeof localGitBackend>): Promise<Hono> {
	const app = new Hono();
	// Inject a fake session so the (owner-only) push gate passes in the test.
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
