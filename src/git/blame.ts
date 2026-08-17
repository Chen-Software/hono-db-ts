/**
 * blame — per-line commit attribution for the file view (P1-5).
 *
 * Isomorphic-git has no blame API, so this ports the line-tracking approach
 * used by `git blame` without a CLI:
 *   1. Get the commits that touched `path` (oldest → newest) via
 *      `commitsForPath`.
 *   2. Walk them in chronological order, maintaining a `blame[line]` array of
 *      the oid that produced each CURRENT line. At each step, diff the previous
 *      version against the new one; context lines inherit their prior oid,
 *      added lines get the current commit. Deleted lines are dropped.
 *   3. Enrich each distinct oid with commit metadata.
 *
 * This runs identically on the local-fs and R2 backends and is deterministic
 * on small files (the e2e case). Renames are NOT followed — blame is per-path,
 * matching the P1 scope; cross-rename blame is a P2 enhancement.
 *
 * Workers-safe: isomorphic-git + Web Platform globals only (no node:* APIs).
 */

import * as git from "isomorphic-git";
import type { FsClient } from "isomorphic-git";
import { getCommit, readBlob } from "./read";
import { commitsForPath } from "./search";
import { batchReadObjects } from "./objects";

export interface BlameLine {
	/** 1-based line number in the current file. */
	line: number;
	/** Oid of the commit that last touched this line. */
	oid: string;
	message: string;
	author: string;
	timestamp: number;
}

export interface BlameResult {
	path: string;
	ref: string;
	lines: BlameLine[];
}

/** Split text into lines, dropping a single trailing newline (matches diff). */
function splitLines(text: string): string[] {
	const t = text.endsWith("\n") ? text.slice(0, -1) : text;
	return t.split("\n");
}

/**
 * Align new lines to old lines via LCS. Returns an array of length
 * `newLines.length`, where each entry is the 0-based old-line index the new
 * line came from, or -1 if the line is an addition.
 */
function alignLines(oldText: string, newText: string): number[] {
	const a = splitLines(oldText);
	const b = splitLines(newText);

	// Common prefix / suffix (cheap).
	let pre = 0;
	while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
	let suf = 0;
	while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;

	const midA = a.slice(pre, a.length - suf);
	const midB = b.slice(pre, b.length - suf);
	const n = midA.length;
	const m = midB.length;

	// LCS DP.
	const dp = new Uint32Array((n + 1) * (m + 1));
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			dp[i * (m + 1) + j] =
				midA[i - 1] === midB[j - 1]
					? dp[(i - 1) * (m + 1) + j - 1] + 1
					: Math.max(dp[(i - 1) * (m + 1) + j], dp[i * (m + 1) + j - 1]);
		}
	}

	// Reconstruct the edit script (k=keep, a=add, d=delete).
	const edits: Array<"k" | "a" | "d"> = [];
	let i = n;
	let j = m;
	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && midA[i - 1] === midB[j - 1]) {
			edits.unshift("k");
			i--;
			j--;
		} else if (j > 0 && (i === 0 || dp[i * (m + 1) + j - 1] >= dp[(i - 1) * (m + 1) + j])) {
			edits.unshift("a");
			j--;
		} else {
			edits.unshift("d");
			i--;
		}
	}

	// Map each NEW line to its old line index (1-based walk, 0-based result).
	// The common prefix and suffix are unchanged context: seed them 1:1 BEFORE
	// walking the edit script, otherwise they'd fall through to `-1` (treated
	// as added) and get wrongly attributed to the current commit.
	const map = new Array<number>(b.length).fill(-1);
	for (let k = 0; k < pre; k++) map[k] = k;
	for (let k = 0; k < suf; k++) map[b.length - suf + k] = a.length - suf + k;
	let oldLine = pre + 1;
	let newLine = pre + 1;
	for (const e of edits) {
		if (e === "k") {
			map[newLine - 1] = oldLine - 1;
			oldLine++;
			newLine++;
		} else if (e === "a") {
			map[newLine - 1] = -1;
			newLine++;
		} else {
			oldLine++;
		}
	}
	return map;
}

/** Resolve the blob oid for `path` at commit `commitOid`, or null if absent. */
async function blobOidAtCommit(
	fs: FsClient,
	gitdir: string,
	commitOid: string,
	path: string,
): Promise<string | null> {
	try {
		const { commit } = await git.readCommit({ fs, gitdir, oid: commitOid });
		let oid = commit.tree;
		for (const part of path.split("/").filter(Boolean)) {
			const { tree } = await git.readTree({ fs, gitdir, oid });
			const entry = tree.find((e) => e.path === part);
			if (!entry) return null;
			oid = entry.oid;
		}
		return oid;
	} catch {
		return null;
	}
}

/** Blame a file at `ref:path` — line → last-touching commit. */
export async function blameFile(
	fs: FsClient,
	gitdir: string,
	ref: string,
	path: string,
): Promise<BlameResult> {
	const history = await commitsForPath(fs, gitdir, ref, path, { depth: 2000 });
	// `commitsForPath` is newest-first; blame processes oldest → newest.
	const ordered = [...history.commits].reverse();

	if (ordered.length === 0) {
		// No recorded history for the path: attribute the whole current file to
		// the resolved HEAD commit (e.g. a freshly pushed file with no diffs
		// captured). If even that fails, return an empty blame.
		let headOid: string | null = null;
		try {
			headOid = await git.resolveRef({ fs, gitdir, ref });
		} catch {
			return { path, ref, lines: [] };
		}
		const c = await getCommit(fs, gitdir, headOid);
		if (!c) return { path, ref, lines: [] };
		let bytes: Uint8Array;
		try {
			bytes = await readBlob(fs, gitdir, ref, path);
		} catch {
			return { path, ref, lines: [] };
		}
		const lines = splitLines(new TextDecoder().decode(bytes));
		return {
			path,
			ref,
			lines: lines.map((_, idx) => ({
				line: idx + 1,
				oid: c.oid,
				message: c.message,
				author: c.author.name,
				timestamp: c.timestamp,
			})),
		};
	}

	// Two-phase batch read (P2-1 latency fix for the blame path):
	//   1. Resolve each version's blob oid (the path may be absent at older
	//      commits — e.g. pre-rename — in which case we record null).
	//   2. Read every blob body ONCE with bounded concurrency, instead of one
	//      R2 GET per commit.
	const oidByCommit = new Map<string, string | null>();
	const blobOids: string[] = [];
	for (const c of ordered) {
		const b = await blobOidAtCommit(fs, gitdir, c.oid, path);
		oidByCommit.set(c.oid, b);
		if (b) blobOids.push(b);
	}
	const blobMap = await batchReadObjects(fs, gitdir, blobOids);

	// Incremental line tracking.
	let blame: string[] = []; // oid per current new line
	let prevText: string | null = null;
	for (const c of ordered) {
		const blobOid = oidByCommit.get(c.oid) ?? null;
		if (!blobOid || !blobMap.has(blobOid)) {
			// Path absent at this commit (e.g. pre-rename) — reset tracking.
			prevText = null;
			continue;
		}
		const text = new TextDecoder().decode(blobMap.get(blobOid)!);
		const newLines = splitLines(text);
		if (prevText === null) {
			// First known version: every line attributed to this (earliest) commit.
			blame = newLines.map(() => c.oid);
		} else {
			const map = alignLines(prevText, text);
			const next = new Array<string>(newLines.length).fill(c.oid);
			for (let k = 0; k < newLines.length; k++) {
				const oldIdx = map[k]!;
				if (oldIdx >= 0 && blame[oldIdx]) next[k] = blame[oldIdx]!;
			}
			blame = next;
		}
		prevText = text;
	}

	// Enrich distinct oids with commit metadata.
	const distinct = [...new Set(blame)];
	const info = new Map<string, { message: string; author: string; timestamp: number }>();
	for (const oid of distinct) {
		const c = await getCommit(fs, gitdir, oid);
		if (c) info.set(oid, { message: c.message, author: c.author.name, timestamp: c.timestamp });
	}

	const lines: BlameLine[] = blame.map((oid, idx) => {
		const m = info.get(oid) ?? { message: "", author: "", timestamp: 0 };
		return { line: idx + 1, oid, message: m.message, author: m.author, timestamp: m.timestamp };
	});
	return { path, ref, lines };
}
