/**
 * Phase 1 verification — the new `getCommit` helper and `/commit/:oid`
 * endpoint, plus the tree/read endpoints that back the Forgejo-aligned
 * `/src/{ref}/{path}` catch-all route.
 */
import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as git from "isomorphic-git";
import { nodeFs } from "@/git/fs-node";
import { getCommit, listTree, readBlob } from "@/git/read";

const OWNER = "owner";
const AUTHOR = { name: OWNER, email: "owner@example.com" };

/** Commit a set of {path → content} changes; returns the head oid. */
async function commitAll(
	fs: any,
	dir: string,
	message: string,
	changes: Record<string, string>,
): Promise<string> {
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

/** Build a fresh repo with a couple commits. Returns the fs + gitdir + head oid. */
async function makeRepo() {
	const fs = nodeFs();
	const base = mkdtempSync(join(tmpdir(), "cf-p1-"));
	const dir = join(base, "repo");
	const gitdir = join(dir, ".git");
	await git.init({ fs, dir, defaultBranch: "main" });
	const c1 = await commitAll(fs, dir, "Initial commit", { "readme.md": "hello\n" });
	const c2 = await commitAll(fs, dir, "Update readme\n\nwith a body", { "readme.md": "hello\nworld\n" });
	return { fs, base, gitdir, oid: c2, c1 };
}

test("getCommit returns message, author and parents", async () => {
	const { fs, base, gitdir, oid } = await makeRepo();
	try {
		const commit = await getCommit(fs, gitdir, oid);
		expect(commit).not.toBeNull();
		expect(commit!.message).toContain("Update readme");
		expect(commit!.author.name).toBe(OWNER);
		expect(commit!.parent).toHaveLength(1);
	} finally {
		rmSync(base, { recursive: true, force: true });
	}
});

test("getCommit returns null for a missing oid", async () => {
	const { fs, base, gitdir } = await makeRepo();
	try {
		const commit = await getCommit(fs, gitdir, "0".repeat(40));
		expect(commit).toBeNull();
	} finally {
		rmSync(base, { recursive: true, force: true });
	}
});

test("tree and read back the /src/{ref}/{path} addressing (a file and its content)", async () => {
	const { fs, base, gitdir } = await makeRepo();
	try {
		const entries = await listTree(fs, gitdir, "main", "/");
		expect(entries.some((e: any) => e.name === "readme.md" && e.type === "blob")).toBe(true);
		const bytes = await readBlob(fs, gitdir, "main", "readme.md");
		expect(new TextDecoder().decode(bytes)).toContain("hello");
	} finally {
		rmSync(base, { recursive: true, force: true });
	}
});
