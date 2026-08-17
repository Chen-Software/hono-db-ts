/**
 * objects — batch object reads (P2-1, first increment).
 *
 * The read paths (diff, archive, blame, tree-walk) currently issue one
 * `git.readObject` per blob/tree, which on the R2 backend is one GET per
 * object — the N-GET problem P2-1 exists to fix. This module provides a
 * bounded-concurrency batch reader so those paths fan the reads out in
 * parallel instead of sequentially, cutting wall-clock latency on R2 by
 * ~concurrency× without touching the storage format.
 *
 * This is the SAFE first slice of P2-1. The deeper fix — a pack-indexed
 * backend that maps `oid → (pack, offset, length)` at `indexPack` time so the
 * N GETs collapse into a single range read — builds on this entry point
 * (see docs/git-backend-impl-plans.md P2-1).
 *
 * Workers-safe: isomorphic-git + Web Platform globals only (no node:* APIs).
 */

import * as git from "isomorphic-git";
import type { FsClient } from "isomorphic-git";

/** Default fan-out for batch reads. */
export const DEFAULT_CONCURRENCY = 8;

/**
 * Read many git objects concurrently with a bounded worker pool.
 *
 * @returns a Map of `oid → content bytes` for every oid that resolved. Oids
 *   that fail to read are simply omitted (the caller decides how to handle a
 *   missing object), keeping a partial batch from failing the whole request.
 */
export async function batchReadObjects(
	fs: FsClient,
	gitdir: string,
	oids: string[],
	opts: { concurrency?: number; format?: "content" | "parsed" } = {},
): Promise<Map<string, Uint8Array>> {
	const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
	const out = new Map<string, Uint8Array>();
	let cursor = 0;
	async function worker() {
		while (cursor < oids.length) {
			const oid = oids[cursor++]!;
			try {
				const { object } = await git.readObject({
					fs,
					gitdir,
					oid,
					format: opts.format ?? "content",
				});
				out.set(
					oid,
					object instanceof Uint8Array ? object : new Uint8Array(object as ArrayBuffer),
				);
			} catch {
				// Skip unreadable objects; the caller handles absence.
			}
		}
	}
	await Promise.all(Array.from({ length: concurrency }, () => worker()));
	return out;
}

/** Collect the set of blob oids a diff needs (old + new for every change). */
export function diffBlobOids(
	files: Array<{ oldOid?: string; newOid?: string; status: string }>,
): string[] {
	const set = new Set<string>();
	for (const f of files) {
		if (f.oldOid) set.add(f.oldOid);
		if (f.newOid) set.add(f.newOid);
	}
	return [...set];
}
