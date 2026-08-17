/**
 * read — git read layer for the forge UI (tree, blob/README, commit history).
 *
 * All objects come from the storage backend via isomorphic-git; the `Repository`
 * DB row stays metadata-only (per the Forgejo architecture). Mirrors
 * Forgejo's `modules/git` + `modules/gitrepo` read paths.
 */

import * as git from "isomorphic-git";
import type { FsClient } from "isomorphic-git";

export interface TreeEntry {
	name: string;
	type: "blob" | "tree";
	oid: string;
	mode: string;
}

export interface CommitInfo {
	oid: string;
	message: string;
	author: { name: string; email: string };
	committer: { name: string; email: string };
	timestamp: number;
	parent: string[];
}

/** Resolve a sub-path within a commit/tree to its {oid, type}. */
async function oidAtPath(fs: FsClient, gitdir: string, startOid: string, path: string): Promise<{ oid: string; type: string }> {
	if (!path || path === "/" || path === "") return { oid: startOid, type: "tree" };
	const parts = path.split("/").filter(Boolean);
	let oid = startOid;
	let type = "tree";
	for (const part of parts) {
		const { tree } = await git.readTree({ fs, gitdir, oid });
		const entry = tree.find((e) => e.path === part);
		if (!entry) throw new Error(`path not found: ${path}`);
		oid = entry.oid;
		type = entry.type;
	}
	return { oid, type };
}

/** List the entries of a directory at `ref:path` (default: repo root). */
export async function listTree(fs: FsClient, gitdir: string, ref: string, path = "/"): Promise<TreeEntry[]> {
	// A freshly created repo has no commits/refs yet — `resolveRef` throws.
	// That is not an error: the tree of an empty repo is empty. Path lookup
	// failures below still throw (404) so `read`/`tree?path=` stay correct.
	let commitOid: string;
	try {
		commitOid = await git.resolveRef({ fs, gitdir, ref });
	} catch {
		return [];
	}
	const { oid, type } = await oidAtPath(fs, gitdir, commitOid, path);
	if (type !== "tree") throw new Error(`not a directory: ${path}`);
	const { tree } = await git.readTree({ fs, gitdir, oid });
	return tree.map((e) => ({ name: e.path, type: e.type as "blob" | "tree", oid: e.oid, mode: String(e.mode) }));
}

/** Read a file's raw bytes at `ref:path`. */
export async function readBlob(fs: FsClient, gitdir: string, ref: string, path: string): Promise<Uint8Array> {
	const commitOid = await git.resolveRef({ fs, gitdir, ref });
	const { oid, type } = await oidAtPath(fs, gitdir, commitOid, path);
	if (type !== "blob") throw new Error(`not a file: ${path}`);
	const { object } = await git.readObject({ fs, gitdir, oid, format: "content" });
	return new Uint8Array(object as Uint8Array);
}

/** Find a README at the repo root (case-insensitive, common extensions). */
export async function findReadme(fs: FsClient, gitdir: string, ref: string): Promise<{ path: string; oid: string } | null> {
	const entries = await listTree(fs, gitdir, ref, "/");
	const readme = entries.find((e) => e.type === "blob" && /^readme(\.[a-z0-9]+)?$/i.test(e.name));
	return readme ? { path: readme.name, oid: readme.oid } : null;
}

/** A single commit by oid, or null when it does not exist. */
export async function getCommit(fs: FsClient, gitdir: string, oid: string): Promise<CommitInfo | null> {
	try {
		const { commit } = await git.readCommit({ fs, gitdir, oid })
		return {
			oid,
			message: commit.message,
			author: { name: commit.author.name, email: commit.author.email },
			committer: { name: commit.committer.name, email: commit.committer.email },
			timestamp: commit.author.timestamp,
			parent: commit.parent ?? [],
		}
	} catch {
		return null
	}
}

/** Paginated commit history for a ref. */
export async function logCommits(
	fs: FsClient,
	gitdir: string,
	ref: string,
	opts: { skip?: number; max?: number } = {},
): Promise<CommitInfo[]> {
	const skip = opts.skip ?? 0;
	const max = opts.max ?? 30;
	// Empty repo (no refs yet) → no history, not an error.
	let commits: Awaited<ReturnType<typeof git.log>>;
	try {
		commits = await git.log({ fs, gitdir, ref, depth: skip + max });
	} catch {
		return [];
	}
	return commits.slice(skip, skip + max).map((c) => ({
		oid: c.oid,
		message: c.commit.message,
		author: { name: c.commit.author.name, email: c.commit.author.email },
		committer: { name: c.commit.committer.name, email: c.commit.committer.email },
		timestamp: c.commit.author.timestamp,
		parent: c.commit.parent ?? [],
	}));
}
