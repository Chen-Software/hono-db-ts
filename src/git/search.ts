/**
 * search — commit search, file history, and ahead/behind (P1-4).
 *
 * Isomorphic-git has no server-side commit search or `git log -- <path>`
 * filter, so these are built on `git.log` + JS filtering:
 *   - `searchCommits`: message/author/committer/date filtering over a bounded
 *     `git.log` walk (correct, provider-agnostic; P2-1 batch reads make it
 *     cheaper on R2).
 *   - `commitsForPath`: uses `git.log({ includeChanges: true })` — each commit
 *     carries `[newOid, oldOid, filepath]` tuples vs its first parent — and
 *     keeps the commits whose changes touch the path. This is the file-history
 *     page. (No rename following: P1 blame/ history is per-path.)
 *   - `aheadBehind` / `commitsBetween`: the PR compare stats. Built from oid
 *     reachability sets of the two refs.
 *
 * Workers-safe: isomorphic-git + Web Platform globals only (no node:* APIs).
 */

import * as git from "isomorphic-git";
import type { FsClient } from "isomorphic-git";
import type { CommitInfo } from "./read";

/** Max commits walked for any unbounded log (P2-1 will lift this via packs). */
const WALK_DEPTH = 2000;

function toCommitInfo(c: Awaited<ReturnType<typeof git.log>>[number]): CommitInfo {
	return {
		oid: c.oid,
		message: c.commit.message,
		author: { name: c.commit.author.name, email: c.commit.author.email },
		committer: { name: c.commit.committer.name, email: c.commit.committer.email },
		timestamp: c.commit.author.timestamp,
		parent: c.commit.parent ?? [],
	};
}

/** Walk commits reachable from `ref` (bounded), newest-first. */
async function walkLog(fs: FsClient, gitdir: string, ref: string, depth = WALK_DEPTH): Promise<CommitInfo[]> {
	try {
		const log = await git.log({ fs, gitdir, ref, depth });
		return log.map(toCommitInfo);
	} catch {
		return [];
	}
}

export interface CommitSearchOpts {
	/** Substring match against the commit message (case-insensitive). */
	query?: string;
	/** Substring match against `Author Name <email>` (case-insensitive). */
	author?: string;
	/** Substring match against `Committer Name <email>` (case-insensitive). */
	committer?: string;
	/** Include only commits at or after this unix timestamp (seconds). */
	after?: number;
	/** Include only commits at or before this unix timestamp (seconds). */
	before?: number;
	page?: number;
	perPage?: number;
}

export interface CommitSearchResult {
	commits: CommitInfo[];
	/** Total matches before pagination. */
	total: number;
	page: number;
}

/** Commit search UI: filter the history by message / author / date. */
export async function searchCommits(
	fs: FsClient,
	gitdir: string,
	ref: string,
	opts: CommitSearchOpts = {},
): Promise<CommitSearchResult> {
	const commits = await walkLog(fs, gitdir, ref);
	const q = opts.query?.toLowerCase();
	const author = opts.author?.toLowerCase();
	const committer = opts.committer?.toLowerCase();
	const filtered = commits.filter((c) => {
		if (q && !c.message.toLowerCase().includes(q)) return false;
		if (author && !`${c.author.name} <${c.author.email}>`.toLowerCase().includes(author)) return false;
		if (committer && !`${c.committer.name} <${c.committer.email}>`.toLowerCase().includes(committer)) return false;
		if (opts.after != null && c.timestamp < opts.after) return false;
		if (opts.before != null && c.timestamp > opts.before) return false;
		return true;
	});
	const perPage = Math.max(1, opts.perPage ?? 30);
	const page = Math.max(1, opts.page ?? 1);
	const slice = filtered.slice((page - 1) * perPage, page * perPage);
	return { commits: slice, total: filtered.length, page };
}

export interface FileHistoryOpts {
	page?: number;
	perPage?: number;
	/** Override the walk depth (default `WALK_DEPTH`). */
	depth?: number;
}

export interface FileHistoryResult {
	/** Newest-first commits that changed `path`. */
	commits: CommitInfo[];
	total: number;
	page: number;
}

/** File-history page: commits whose changes touched `path` (vs first parent). */
export async function commitsForPath(
	fs: FsClient,
	gitdir: string,
	ref: string,
	path: string,
	opts: FileHistoryOpts = {},
): Promise<FileHistoryResult> {
	let log: Awaited<ReturnType<typeof git.log>>;
	try {
		log = await git.log({ fs, gitdir, ref, depth: opts.depth ?? WALK_DEPTH, includeChanges: true });
	} catch {
		return { commits: [], total: 0, page: opts.page ?? 1 };
	}
	const matches = log
		.filter((c) => {
			// `git.log` with `includeChanges: true` attaches `[newOid, oldOid,
			// filepath]` tuples to `commit.commit.changes` (not the log entry).
			const changes = (c.commit as { changes?: Array<[string | null, string | null, string]> }).changes;
			if (!changes) return false;
			return changes.some((ch) => ch[2] === path);
		})
		.map(toCommitInfo);
	const perPage = Math.max(1, opts.perPage ?? 30);
	const page = Math.max(1, opts.page ?? 1);
	const slice = matches.slice((page - 1) * perPage, page * perPage);
	return { commits: slice, total: matches.length, page };
}

/** Set of all commit oids reachable from `ref` (bounded). */
async function reachableOids(fs: FsClient, gitdir: string, ref: string): Promise<Set<string>> {
	const set = new Set<string>();
	try {
		const log = await git.log({ fs, gitdir, ref, depth: WALK_DEPTH });
		for (const c of log) set.add(c.oid);
	} catch {
		// Unreadable ref → empty set.
	}
	return set;
}

export interface AheadBehind {
	/** Commits in `head` not in `base`. */
	ahead: number;
	/** Commits in `base` not in `head`. */
	behind: number;
	aheadCommits: CommitInfo[];
	behindCommits: CommitInfo[];
}

/** Ahead/behind between two refs — the PR compare / branch-divergence stats. */
export async function aheadBehind(
	fs: FsClient,
	gitdir: string,
	base: string,
	head: string,
): Promise<AheadBehind> {
	const baseSet = await reachableOids(fs, gitdir, base);
	const headSet = await reachableOids(fs, gitdir, head);

	const aheadCommits: CommitInfo[] = [];
	const headLog = await walkLog(fs, gitdir, head);
	for (const c of headLog) if (!baseSet.has(c.oid)) aheadCommits.push(c);

	const behindCommits: CommitInfo[] = [];
	const baseLog = await walkLog(fs, gitdir, base);
	for (const c of baseLog) if (!headSet.has(c.oid)) behindCommits.push(c);

	return {
		ahead: aheadCommits.length,
		behind: behindCommits.length,
		aheadCommits,
		behindCommits,
	};
}
