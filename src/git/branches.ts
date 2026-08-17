/**
 * branches — branch listing + CRUD for the forge UI / branch dropdowns.
 *
 * Isomorphic-git only knows refs; this module adds Forgejo-style conveniences
 * (paginated listing with the latest commit, rename, "branches containing a
 * commit") on top of `listBranches` / `resolveRef` / `writeRef` / `deleteRef`.
 *
 * Workers-safe: isomorphic-git + Web Platform globals only (no node:* APIs).
 */

import * as git from "isomorphic-git";
import type { FsClient } from "isomorphic-git";

export interface BranchInfo {
	name: string;
	oid: string;
	/** Latest commit on the branch (for the branch list UI). */
	latestCommit?: { oid: string; message: string; author: string; timestamp: number };
}

/** Paginated branch listing result. */
export interface BranchList {
	branches: BranchInfo[];
	/** Total branch count (before pagination) — for UI paging. */
	total: number;
}

/** List branches, paginated, with the tip commit on each (Forgejo `repo_branch.go` parity). */
export async function listBranches(
	fs: FsClient,
	gitdir: string,
	opts: { page?: number; perPage?: number } = {},
): Promise<BranchList> {
	const names = await git.listBranches({ fs, gitdir });
	const sorted = [...names].sort();
	const perPage = Math.max(1, opts.perPage ?? 30);
	const page = Math.max(1, opts.page ?? 1);
	const slice = sorted.slice((page - 1) * perPage, (page - 1) * perPage + perPage);

	const branches: BranchInfo[] = [];
	for (const name of slice) {
		const oid = await git.resolveRef({ fs, gitdir, ref: `refs/heads/${name}` });
		let latestCommit: BranchInfo["latestCommit"];
		try {
			const log = await git.log({ fs, gitdir, ref: `refs/heads/${name}`, depth: 1 });
			const c = log[0]?.commit;
			if (c) {
				latestCommit = {
					oid: log[0]!.oid,
					message: c.message,
					author: c.author.name,
					timestamp: c.author.timestamp,
				};
			}
		} catch {
			// Unreadable / unborn branch — list it without commit metadata.
		}
		branches.push({ name, oid, latestCommit });
	}
	return { branches, total: sorted.length };
}

/** Create a branch `name` pointing at `from` (a ref or oid). Throws if it already exists. */
export async function createBranch(fs: FsClient, gitdir: string, name: string, from: string): Promise<string> {
	const value = await git.resolveRef({ fs, gitdir, ref: from });
	await git.writeRef({ fs, gitdir, ref: `refs/heads/${name}`, value, force: false });
	return value;
}

/** Delete a branch by name. Throws if the ref does not exist. */
export async function deleteBranch(fs: FsClient, gitdir: string, name: string): Promise<void> {
	await git.deleteRef({ fs, gitdir, ref: `refs/heads/${name}` });
}

/** Rename a branch: point a new ref at the old tip, then delete the old ref. */
export async function renameBranch(
	fs: FsClient,
	gitdir: string,
	oldName: string,
	newName: string,
): Promise<string> {
	const oid = await git.resolveRef({ fs, gitdir, ref: `refs/heads/${oldName}` });
	await git.writeRef({ fs, gitdir, ref: `refs/heads/${newName}`, value: oid, force: false });
	await git.deleteRef({ fs, gitdir, ref: `refs/heads/${oldName}` });
	return oid;
}

/**
 * Branches whose history contains `oid` — the `git for-each-ref --contains`
 * equivalent. Walks each branch up to a depth cap (repo size is bounded in
 * practice; P2-1 batch reads will make this cheaper).
 */
export async function branchesContaining(fs: FsClient, gitdir: string, oid: string): Promise<string[]> {
	const names = await git.listBranches({ fs, gitdir });
	const out: string[] = [];
	for (const name of names) {
		try {
			const log = await git.log({ fs, gitdir, ref: `refs/heads/${name}`, depth: 1000 });
			if (log.some((c) => c.oid === oid)) out.push(name);
		} catch {
			// Skip unreadable branches.
		}
	}
	return out.sort();
}
