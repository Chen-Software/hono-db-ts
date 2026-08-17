/**
 * diff — commit/ref diff layer for the forge UI (P1-1).
 *
 * Ports the read-side of Forgejo's `modules/git/diff.go` +
 * `modules/git/diff_compare.go` onto isomorphic-git: given two refs (or a
 * single commit vs its parent), produce a per-file change list with unified
 * hunks and rename detection. Everything is built on tree walking + blob
 * reads — no `git` CLI, so it runs identically on the local-fs and R2
 * backends.
 *
 * Design decisions (docs/git-backend-impl-plans.md P1-1):
 *   - Rename detection (-M): a deleted blob whose content hash equals an added
 *     blob's is reported as a rename instead of del+add.
 *   - Size caps: files above `MAX_DIFF_BYTES` are reported as changed but their
 *     hunks are not rendered (mirrors Forgejo's `MaxFileSize`); line diffs are
 *     bounded to keep the Workers isolate safe.
 *   - `base` may be empty ("" — the empty tree): an initial commit then
 *     reports every file as added, mirroring `git show <root-commit>`.
 */

import * as git from "isomorphic-git";
import type { FsClient } from "isomorphic-git";

/** Files larger than this are reported as changed but hunks are not rendered. */
export const MAX_DIFF_BYTES = 512 * 1024;
/** Line-diff dimension cap (lines per side) — guards the O(n·m) LCS DP. */
const MAX_DIFF_LINES = 5000;
/** Context lines around each hunk (unified diff default). */
const HUNK_CONTEXT = 3;

export type DiffStatus = "added" | "modified" | "deleted" | "renamed";

export interface DiffLine {
	type: "add" | "del" | "ctx";
	content: string;
	/** 1-based line number in the OLD file (ctx/del), null for pure adds. */
	oldLine?: number;
	/** 1-based line number in the NEW file (ctx/add), null for pure dels. */
	newLine?: number;
}

export interface DiffHunk {
	header: string;
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	lines: DiffLine[];
}

export interface FileDiff {
	path: string;
	/** Set when `status === "renamed"` — the pre-rename path. */
	oldPath?: string;
	status: DiffStatus;
	oldOid?: string;
	newOid?: string;
	additions: number;
	deletions: number;
	/** Whether the blob contains a NUL byte (no hunks rendered). */
	binary: boolean;
	/** Whether hunks were skipped due to the size cap. */
	truncated: boolean;
	/** Unified hunks (absent for binary/truncated files). */
	hunks?: DiffHunk[];
}

export interface CommitDiff {
	/** Resolved base oid (empty tree when `base` was ""). */
	base: string;
	/** Resolved head oid. */
	head: string;
	files: FileDiff[];
	stats: { files: number; additions: number; deletions: number };
}

/** Resolve a ref/oid to a commit oid (refs may point at annotated tags). */
async function resolveCommit(fs: FsClient, gitdir: string, ref: string): Promise<string> {
	return git.resolveRef({ fs, gitdir, ref });
}

/** Recursively flatten a tree into `path → { oid, mode }`. */
async function treeMap(
	fs: FsClient,
	gitdir: string,
	treeOid: string,
	prefix = "",
): Promise<Map<string, { oid: string; mode: string }>> {
	const map = new Map<string, { oid: string; mode: string }>();
	const { tree } = await git.readTree({ fs, gitdir, oid: treeOid });
	for (const e of tree) {
		const p = prefix ? `${prefix}/${e.path}` : e.path;
		if (e.type === "tree") {
			const sub = await treeMap(fs, gitdir, e.oid, p);
			for (const [k, v] of sub) map.set(k, v);
		} else {
			map.set(p, { oid: e.oid, mode: String(e.mode) });
		}
	}
	return map;
}

/** Read a blob's raw bytes (content) by oid. */
async function blobBytes(fs: FsClient, gitdir: string, oid: string): Promise<Uint8Array> {
	const { object } = await git.readObject({ fs, gitdir, oid, format: "content" });
	return object instanceof Uint8Array ? object : new Uint8Array(object as ArrayBuffer);
}

/** Read a commit's tree oid. */
async function commitTree(fs: FsClient, gitdir: string, commitOid: string): Promise<string> {
	const { commit } = await git.readCommit({ fs, gitdir, oid: commitOid });
	return commit.tree;
}

/**
 * Compute the line diff between two texts and group it into unified hunks.
 *
 * The algorithm trims the common prefix/suffix first (cheap), then runs a
 * bounded LCS dynamic program on the remaining middle — keeping the common
 * case (a few changed lines in an otherwise identical file) fast.
 */
export function diffLines(oldText: string, newText: string, ctx = HUNK_CONTEXT): DiffHunk[] {
	const a = oldText === "" ? [] : oldText.split("\n");
	const b = newText === "" ? [] : newText.split("\n");

	// Common prefix.
	let pre = 0;
	while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
	// Common suffix (after the prefix).
	let suf = 0;
	while (
		suf < a.length - pre &&
		suf < b.length - pre &&
		a[a.length - 1 - suf] === b[b.length - 1 - suf]
	)
		suf++;

	const midA = a.slice(pre, a.length - suf);
	const midB = b.slice(pre, b.length - suf);

	if (midA.length === 0 && midB.length === 0) return [];

	// LCS DP on the middle, bounded.
	const n = Math.min(midA.length, MAX_DIFF_LINES);
	const m = Math.min(midB.length, MAX_DIFF_LINES);
	const capHit = n !== midA.length || m !== midB.length;
	// If the cap is hit, treat the tail as fully changed (still correct-ish and
	// bounded); the size cap above normally prevents reaching here.
	const lcs = new Uint32Array((n + 1) * (m + 1));
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			lcs[i * (m + 1) + j] =
				midA[i - 1] === midB[j - 1]
					? lcs[(i - 1) * (m + 1) + j - 1] + 1
					: Math.max(lcs[(i - 1) * (m + 1) + j], lcs[i * (m + 1) + j - 1]);
		}
	}
	// Reconstruct the edit script (1 = keep, 2 = delete from A, 3 = add from B).
	const edits: Array<"keep" | "del" | "add"> = [];
	let i = n;
	let j = m;
	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && midA[i - 1] === midB[j - 1]) {
			edits.unshift("keep");
			i--;
			j--;
		} else if (j > 0 && (i === 0 || lcs[i * (m + 1) + j - 1] >= lcs[(i - 1) * (m + 1) + j])) {
			edits.unshift("add");
			j--;
		} else {
			edits.unshift("del");
			i--;
		}
	}
	if (capHit) {
		// Any lines past the cap are unknown — emit the remainder as del+add.
		const extraA = midA.slice(n);
		const extraB = midB.slice(m);
		for (let k = 0; k < Math.max(extraA.length, extraB.length); k++) {
			if (k < extraA.length) edits.push("del");
			if (k < extraB.length) edits.push("add");
		}
	}

	// Build the hunks: walk the edit script, tracking old/new line numbers, and
	// group runs (with `ctx` context lines either side) into hunks.
	const hunks: DiffHunk[] = [];
	let oldLine = pre + 1; // 1-based, next line in OLD file
	let newLine = pre + 1; // 1-based, next line in NEW file
	let hunkStart = -1;
	let hunkOldStart = 0;
	let hunkNewStart = 0;
	const hunkLines: DiffLine[] = [];
	const ctxBuf: DiffLine[] = [];

	const flush = () => {
		if (hunkLines.length === 0) return;
		const oldLines = hunkLines.filter((l) => l.type !== "add").length;
		const newLines = hunkLines.filter((l) => l.type !== "del").length;
		hunks.push({
			header: `@@ -${hunkOldStart},${oldLines} +${hunkNewStart},${newLines} @@`,
			oldStart: hunkOldStart,
			oldLines,
			newStart: hunkNewStart,
			newLines,
			lines: [...ctxBuf, ...hunkLines],
		});
		ctxBuf.length = 0;
		hunkLines.length = 0;
		hunkStart = -1;
	};

	const emit = (l: DiffLine) => {
		if (l.type === "ctx") {
			if (hunkLines.length === 0) {
				// Not in a hunk yet: keep a rolling context buffer.
				ctxBuf.push(l);
				if (ctxBuf.length > ctx) ctxBuf.shift();
				return;
			}
			hunkLines.push(l);
			if (hunkLines.filter((x) => x.type !== "ctx").length === 0) {
				// A run of pure context closes the hunk.
				flush();
			}
			return;
		}
		if (hunkLines.length === 0) {
			hunkStart = oldLine;
			hunkOldStart = oldLine;
			hunkNewStart = newLine;
		}
		hunkLines.push(l);
	};

	for (const e of edits) {
		if (e === "keep") {
			emit({ type: "ctx", content: midA[oldLine - pre - 1] ?? "", oldLine, newLine });
			oldLine++;
			newLine++;
		} else if (e === "del") {
			emit({ type: "del", content: midA[oldLine - pre - 1] ?? "", oldLine });
			oldLine++;
		} else {
			emit({ type: "add", content: midB[newLine - pre - 1] ?? "", newLine });
			newLine++;
		}
	}
	flush();

	// Post-pass: trim leading context lines already absorbed by the rolling
	// buffer so hunk start numbers stay exact.
	for (const h of hunks) {
		while (h.lines.length > 0 && h.lines[0].type === "ctx") {
			h.lines.shift();
			h.oldStart++;
			h.newStart++;
			h.oldLines--;
			h.newLines--;
		}
	}
	return hunks;
}

/** Render a unified-diff text (used by raw-diff endpoints). */
export function renderUnified(file: FileDiff): string {
	const head = file.status === "renamed"
		? `diff --git a/${file.oldPath} b/${file.path}\nrename from ${file.oldPath}\nrename to ${file.path}`
		: `diff --git a/${file.path} b/${file.path}`;
	const meta = `\nindex ${file.oldOid?.slice(0, 7) ?? "0000000"}..${file.newOid?.slice(0, 7) ?? "0000000"}\n`;
	const statusLine =
		file.status === "added" ? `new file mode ${file.newOid ? "100644" : "100644"}\n` : "";
	const lines = [head + meta + statusLine];
	for (const h of file.hunks ?? []) {
		lines.push(h.header);
		for (const l of h.lines) {
			const prefix = l.type === "add" ? "+" : l.type === "del" ? "-" : " ";
			lines.push(prefix + l.content);
		}
	}
	return lines.join("\n");
}

/** Parse a unified-diff hunk header line into its numbers. */
export function parseHunkHeader(header: string): {
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
} | null {
	const m = header.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
	if (!m) return null;
	return {
		oldStart: Number(m[1]),
		oldLines: m[2] ? Number(m[2]) : 1,
		newStart: Number(m[3]),
		newLines: m[4] ? Number(m[4]) : 1,
	};
}

/**
 * Diff two refs (branches, tags, oids, or "" for the empty tree).
 *
 * `base`/`head` resolve through `resolveRef`; a missing/empty `base` means the
 * empty tree (initial-commit semantics). Returns per-file changes with hunks.
 */
export async function diffCommits(
	fs: FsClient,
	gitdir: string,
	base: string,
	head: string,
): Promise<CommitDiff> {
	const headOid = await resolveCommit(fs, gitdir, head);
	let baseOid = "";
	let baseTree: Map<string, { oid: string; mode: string }> | null = null;
	if (base) {
		try {
			baseOid = await resolveCommit(fs, gitdir, base);
			baseTree = await treeMap(fs, gitdir, await commitTree(fs, gitdir, baseOid));
		} catch {
			baseTree = null; // unknown base → treat as empty tree
		}
	}
	const headTree = await treeMap(fs, gitdir, await commitTree(fs, gitdir, headOid));
	const emptyTree = new Map<string, { oid: string; mode: string }>();
	const bt = baseTree ?? emptyTree;

	// Build the raw change list (no renames yet).
	const raw: FileDiff[] = [];
	const seen = new Set<string>();
	for (const [path, h] of headTree) {
		seen.add(path);
		const b = bt.get(path);
		if (!b) {
			raw.push({
				path,
				status: "added",
				newOid: h.oid,
				additions: 0,
				deletions: 0,
				binary: false,
				truncated: false,
			});
		} else if (b.oid !== h.oid) {
			raw.push({
				path,
				status: "modified",
				oldOid: b.oid,
				newOid: h.oid,
				additions: 0,
				deletions: 0,
				binary: false,
				truncated: false,
			});
		}
	}
	for (const [path, b] of bt) {
		if (!seen.has(path)) {
			raw.push({
				path,
				status: "deleted",
				oldOid: b.oid,
				additions: 0,
				deletions: 0,
				binary: false,
				truncated: false,
			});
		}
	}

	// Rename detection (-M): pair a deleted blob with an added blob of the same
	// content hash. The added file takes the deletion's change and is re-labeled.
	const renamed: FileDiff[] = [];
	const addedIdx = raw.filter((f) => f.status === "added");
	const deletedIdx = raw.filter((f) => f.status === "deleted");
	for (const del of deletedIdx) {
		const idx = addedIdx.findIndex(
			(a) => a.newOid === del.oldOid && a.path !== del.path,
		);
		if (idx >= 0) {
			const add = addedIdx[idx]!;
			renamed.push({
				path: add.path,
				oldPath: del.path,
				status: "renamed",
				oldOid: del.oldOid,
				newOid: add.newOid,
				additions: 0,
				deletions: 0,
				binary: false,
				truncated: false,
			});
			addedIdx.splice(idx, 1);
		}
	}
	// Remove the original added/deleted entries that became renames, then append
	// the rename records (added path = new location, oldPath = deleted location).
	const renamedAdded = new Set(renamed.map((r) => r.path));
	const renamedDeleted = new Set(renamed.map((r) => r.oldPath));
	const final = [
		...raw.filter(
			(f) =>
				!(f.status === "added" && renamedAdded.has(f.path)) &&
				!(f.status === "deleted" && renamedDeleted.has(f.path)),
		),
		...renamed,
	];

	// Render hunks + count additions/deletions for every change (cap by size).
	for (const f of final) {
		if (f.status === "renamed") {
			// Content unchanged (same oid) → no hunks, zero stats.
			continue;
		}
		try {
			const oldBytes = f.oldOid ? await blobBytes(fs, gitdir, f.oldOid) : new Uint8Array(0);
			const newBytes = f.newOid ? await blobBytes(fs, gitdir, f.newOid) : new Uint8Array(0);
			const binary = oldBytes.includes(0) || newBytes.includes(0);
			f.binary = binary;
			const truncated = oldBytes.length + newBytes.length > MAX_DIFF_BYTES;
			f.truncated = truncated;
			if (!binary && !truncated) {
				const oldText = new TextDecoder().decode(oldBytes);
				const newText = new TextDecoder().decode(newBytes);
				const hunks = diffLines(oldText, newText);
				f.hunks = hunks;
				f.additions = hunks.reduce((n, h) => n + h.lines.filter((l) => l.type === "add").length, 0);
				f.deletions = hunks.reduce((n, h) => n + h.lines.filter((l) => l.type === "del").length, 0);
			}
		} catch {
			// Unreadable blob (e.g. submodule commit object) → no hunks.
		}
	}

	const stats = final.reduce(
		(s, f) => ({
			files: s.files + 1,
			additions: s.additions + f.additions,
			deletions: s.deletions + f.deletions,
		}),
		{ files: 0, additions: 0, deletions: 0 },
	);
	return { base: baseOid, head: headOid, files: final, stats };
}

/**
 * Diff a single commit against its parent (or the empty tree for a root
 * commit) — the commit page's diff. Uses the first parent when merged.
 */
export async function diffCommit(
	fs: FsClient,
	gitdir: string,
	commitOid: string,
): Promise<CommitDiff> {
	const { commit } = await git.readCommit({ fs, gitdir, oid: commitOid });
	const parent = commit.parent?.[0] ?? "";
	return diffCommits(fs, gitdir, parent, commitOid);
}
