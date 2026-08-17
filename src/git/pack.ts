/**
 * pack — canonical pack + binary index over R2 (P2-1, the architectural fix).
 *
 * Problem: with loose objects, `git.readObject` → `readObjectLoose` →
 * `fs.read(gitdir/objects/xx/yyy)` issues ONE R2 GET per object. A clone or
 * tree walk of N objects is N GETs — the N-GET problem (Forgejo solves it with
 * `cat-file --batch`; we have no CLI).
 *
 * Fix (mirrors `docs/git-backend-impl-plans.md` P2-1): after each push we build
 * a per-repo **canonical pack** — the concatenation of every reachable object's
 * zlib bytes (each entry is byte-identical to the loose object file) — plus a
 * compact **binary index** `oid → (offset, length)` into that pack. The R2
 * FsClient's `readFile` intercepts `objects/xx/yyyy…` paths, resolves the oid
 * through the index, and serves the bytes from the pack. The pack is fetched
 * ONCE per isolate (one ranged GET per entry on a cold isolate, or one whole
 * GET when it fits the in-isolate LRU); subsequent reads are memory slices.
 *
 * Storage keys (under the gitdir):
 *   objects/pack/canonical.pack   — concatenated zlib object streams
 *   objects/pack/canonical.idx    — binary index (see below)
 *
 * The index format is ours (not git idx v2): 28 bytes/entry, sorted by oid,
 * binary-searchable:
 *   magic  "CFPKIDX1"   (8 bytes)
 *   count  u32be        (4 bytes)
 *   entry[count] × { oid: 20 raw bytes, offset: u32be, length: u32be }
 *
 * The canonical pack is deliberately NOT a git packfile: entries have no
 * varint headers, so any oid is readable with a single ranged GET at
 * `(offset, length)` — exactly the loose-object bytes. If dumb-HTTP / real-git
 * pack serving is ever needed (P2-5), a git-valid repack belongs in P2-2 gc,
 * not here.
 *
 * Workers-safe: Web Platform globals only (no node:* APIs).
 */

import * as git from "isomorphic-git";
import type { FsClient } from "isomorphic-git";
import type { R2Like } from "./fs-r2";
import { listRefs } from "./refs";

/** Byte budget for the in-isolate pack LRU (a few small-to-mid repos). */
const LRU_MAX_BYTES = 64 * 1024 * 1024;
/** Max repos cached in the isolate at once. */
const LRU_MAX_REPOS = 16;

/* ------------------------------------------------------------------ *
 * Index binary format
 * ------------------------------------------------------------------ */

const IDX_MAGIC = new Uint8Array([
	0x43, 0x46, 0x50, 0x4b, // "CFPK"
	0x49, 0x44, 0x58, 0x31, // "IDX1"
]);
const IDX_ENTRY_BYTES = 20 + 4 + 4;

function oidToRaw(hex: string): Uint8Array {
	const raw = new Uint8Array(20);
	for (let i = 0; i < 20; i++) raw[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return raw;
}

function rawToOid(raw: Uint8Array, offset: number): string {
	let hex = "";
	for (let i = 0; i < 20; i++) hex += raw[offset + i]!.toString(16).padStart(2, "0");
	return hex;
}

/** Serialize `oid → (offset, length)` into the binary index format (sorted). */
export function encodePackIndex(
	entries: Array<{ oid: string; offset: number; length: number }>,
): Uint8Array {
	const sorted = [...entries].sort((a, b) => {
		const ar = oidToRaw(a.oid);
		const br = oidToRaw(b.oid);
		for (let i = 0; i < 20; i++) {
			if (ar[i]! < br[i]!) return -1;
			if (ar[i]! > br[i]!) return 1;
		}
		return 0;
	});
	const out = new Uint8Array(8 + 4 + sorted.length * IDX_ENTRY_BYTES);
	out.set(IDX_MAGIC, 0);
	const dv = new DataView(out.buffer);
	dv.setUint32(8, sorted.length, false);
	let p = 12;
	for (const e of sorted) {
		out.set(oidToRaw(e.oid), p);
		dv.setUint32(p + 20, e.offset, false);
		dv.setUint32(p + 24, e.length, false);
		p += IDX_ENTRY_BYTES;
	}
	return out;
}

/** Binary-search an encoded index. Returns `null` when the oid is absent. */
export function lookupPackIndex(
	index: Uint8Array,
	oid: string,
): { offset: number; length: number } | null {
	if (index.length < 12) return null;
	const dv = new DataView(index.buffer, index.byteOffset, index.byteLength);
	const count = dv.getUint32(8, false);
	const target = oidToRaw(oid);
	let lo = 0;
	let hi = count - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1;
		const base = 12 + mid * IDX_ENTRY_BYTES;
		let cmp = 0;
		for (let i = 0; i < 20; i++) {
			const t = target[i]!;
			const v = index[base + i]!;
			if (t < v) {
				cmp = -1;
				break;
			}
			if (t > v) {
				cmp = 1;
				break;
			}
		}
		if (cmp === 0) {
			return { offset: dv.getUint32(base + 20, false), length: dv.getUint32(base + 24, false) };
		}
		if (cmp < 0) hi = mid - 1;
		else lo = mid + 1;
	}
	return null;
}

/* ------------------------------------------------------------------ *
 * Canonical pack build
 * ------------------------------------------------------------------ */

/**
 * Build the canonical pack + index from loose-object bytes.
 *
 * @param entries each `{ oid, bytes }` where `bytes` is the raw loose object
 *   file content (`zlib("<type> <size>\0" + content)`) — what
 *   `git.readObject({ format: "deflated" })` returns.
 * @returns `{ pack, index }` — pack = concatenated zlib streams (sorted by
 *   oid, so the index is trivially ordered); index = binary index mapping
 *   each oid → (offset, length) into the pack.
 */
export function buildCanonicalPack(
	entries: Array<{ oid: string; bytes: Uint8Array }>,
): { pack: Uint8Array; index: Uint8Array } {
	const sorted = [...entries].sort((a, b) => (a.oid < b.oid ? -1 : a.oid > b.oid ? 1 : 0));
	let total = 0;
	for (const e of sorted) total += e.bytes.length;
	const pack = new Uint8Array(total);
	const indexEntries: Array<{ oid: string; offset: number; length: number }> = [];
	let off = 0;
	for (const e of sorted) {
		pack.set(e.bytes, off);
		indexEntries.push({ oid: e.oid, offset: off, length: e.bytes.length });
		off += e.bytes.length;
	}
	return { pack, index: encodePackIndex(indexEntries) };
}

/* ------------------------------------------------------------------ *
 * Isolate-level LRU reader (the "small LRU for hot objects")
 * ------------------------------------------------------------------ */

interface CachedRepo {
	index: Uint8Array | null; // null = repo has no canonical pack yet
	pack: Uint8Array | null; // whole-pack cache (only when it fits LRU budget)
	packSize: number; // total pack bytes (for budget accounting)
	packKey: string;
	indexKey: string;
	lastUsed: number;
}

/**
 * Per-isolate cache of { canonical pack + index } keyed by gitdir, with a
 * total-byte budget. Serves object reads as memory slices after the first
 * fetch — turning N-GET reads into 1-2 GETs per repo per isolate.
 */
export class PackIndexCache {
	private repos = new Map<string, CachedRepo>();
	private bytes = 0;

	constructor(private bucket: R2Like) {}

	private async load(gitdir: string): Promise<CachedRepo | null> {
		const indexKey = `${gitdir.replace(/\/+$/, "")}/objects/pack/canonical.idx`;
		const packKey = `${gitdir.replace(/\/+$/, "")}/objects/pack/canonical.pack`;
		const idxObj = await this.bucket.get(indexKey);
		if (!idxObj) {
			// No canonical pack yet — remember the miss so we don't re-GET.
			const miss: CachedRepo = {
				index: null,
				pack: null,
				packSize: 0,
				packKey,
				indexKey,
				lastUsed: Date.now(),
			};
			this.repos.set(gitdir, miss);
			return miss;
		}
		const index = new Uint8Array(await idxObj.arrayBuffer());
		const sizeObj = await this.bucket.head(packKey);
		const packSize = sizeObj?.size ?? 0;

		let pack: Uint8Array | null = null;
		// Only cache the whole pack when it fits the isolate budget; huge packs
		// fall back to per-entry ranged GETs (still 1 GET, tiny payload).
		if (packSize <= LRU_MAX_BYTES && packSize > 0) {
			const packObj = await this.bucket.get(packKey);
			if (packObj) pack = new Uint8Array(await packObj.arrayBuffer());
		}

		// Evict least-recently-used repos until the new entry fits.
		while (this.bytes + packSize > LRU_MAX_BYTES && this.repos.size > 0) {
			let lruKey: string | null = null;
			let lruTime = Number.POSITIVE_INFINITY;
			for (const [k, v] of this.repos) {
				if (v.lastUsed < lruTime) {
					lruTime = v.lastUsed;
					lruKey = k;
				}
			}
			if (!lruKey) break;
			this.evict(lruKey);
		}

		const repo: CachedRepo = { index, pack, packSize, packKey, indexKey, lastUsed: Date.now() };
		this.repos.set(gitdir, repo);
		this.bytes += packSize;
		return repo;
	}

	private evict(gitdir: string): void {
		const r = this.repos.get(gitdir);
		if (r) {
			this.bytes -= r.packSize;
			this.repos.delete(gitdir);
		}
	}

	/** Drop the cached entry for a gitdir (after a push rewrote the pack). */
	invalidate(gitdir: string): void {
		this.evict(gitdir);
	}

	/** Enforce the max-repo cap (defensive; the byte budget usually binds first). */
	private trimRepos(): void {
		while (this.repos.size > LRU_MAX_REPOS) {
			let lruKey: string | null = null;
			let lruTime = Number.POSITIVE_INFINITY;
			for (const [k, v] of this.repos) {
				if (v.lastUsed < lruTime) {
					lruTime = v.lastUsed;
					lruKey = k;
				}
			}
			if (lruKey) this.evict(lruKey);
			else break;
		}
	}

	/**
	 * Resolve an object's bytes from the canonical pack.
	 * @returns the loose-object bytes (`zlib("<type> <size>\0" + content)`), or
	 *   `null` when the repo has no canonical pack or the oid is absent (caller
	 *   falls back to the loose-object GET).
	 */
	async readObject(gitdir: string, oid: string): Promise<Uint8Array | null> {
		let repo = this.repos.get(gitdir);
		if (!repo) {
			repo = await this.load(gitdir);
			if (!repo) return null;
		}
		repo.lastUsed = Date.now();
		if (!repo.index) return null;
		const hit = lookupPackIndex(repo.index, oid);
		if (!hit) return null;
		if (repo.pack) {
			return repo.pack.slice(hit.offset, hit.offset + hit.length);
		}
		// Cold isolate, pack too large to cache: one ranged GET for this entry.
		const obj = await this.bucket.get(repo.packKey, {
			range: { offset: hit.offset, length: hit.length },
		});
		if (!obj) return null;
		return new Uint8Array(await obj.arrayBuffer());
	}
}

/* ------------------------------------------------------------------ *
 * canonicalize — build the pack + index from the loose store
 * ------------------------------------------------------------------ */

/** Collect every oid reachable from the advertised refs (commits, trees,
 *  blobs, annotated tags → peeled target). Mirrors `upload.ts`'s walk but from
 *  ALL refs so the canonical pack is complete for reads. */
async function collectReachableFromRefs(fs: FsClient, gitdir: string): Promise<string[]> {
	const seen = new Set<string>();
	const out: string[] = [];
	const queue: string[] = [];
	// NOTE: use the project's `listRefs`, NOT isomorphic-git's built-in
	// `git.listRefs`. The built-in reads branch refs via a `fs` call `r2Fs`
	// does not implement, so it returns `[]` on R2 — which would make the
	// canonical pack empty (the optimization would silently no-op). The
	// project's `listRefs` enumerates via `listBranches` + `resolveRef`, which
	// work on `r2Fs`. `listRefs` is positional: (fs, gitdir).
	for (const r of await listRefs(fs, gitdir)) {
		if (r.ref === "HEAD") continue;
		queue.push(r.oid);
	}
	while (queue.length) {
		const oid = queue.pop() as string;
		if (seen.has(oid)) continue;
		seen.add(oid);
		out.push(oid);
		const { type, object } = await git.readObject({ fs, gitdir, oid, format: "parsed" });
		if (type === "commit") {
			const commit = object as { tree: string; parent?: string[] };
			queue.push(commit.tree);
			for (const p of commit.parent ?? []) queue.push(p);
		} else if (type === "tree") {
			const entries = (object as Array<{ oid: string }>) ?? [];
			for (const e of entries) queue.push(e.oid);
		} else if (type === "tag") {
			queue.push((object as { object: string }).object);
		}
	}
	return out;
}

/**
 * Build + store the canonical pack/index for a repo, and invalidate the LRU.
 * Idempotent: safe to run after any push (it rebuilds from reachable objects).
 *
 * @param bucket R2 bucket (used for put + invalidation).
 * @param fs the git FsClient (reads loose objects to build the pack).
 * @param gitdir the repo's gitdir.
 * @param cache the isolate LRU to refresh (may be omitted in tests).
 */
export async function canonicalizeRepo(
	bucket: R2Like,
	fs: FsClient,
	gitdir: string,
	cache?: PackIndexCache,
): Promise<{ packSize: number; objectCount: number }> {
	const oids = await collectReachableFromRefs(fs, gitdir);
	const entries: Array<{ oid: string; bytes: Uint8Array }> = [];
	for (const oid of oids) {
		const { object } = await git.readObject({ fs, gitdir, oid, format: "deflated" });
		entries.push({
			oid,
			bytes: object instanceof Uint8Array ? object : new Uint8Array(object as ArrayBuffer),
		});
	}
	const { pack, index } = buildCanonicalPack(entries);
	const base = gitdir.replace(/\/+$/, "");
	await bucket.put(`${base}/objects/pack/canonical.pack`, pack);
	await bucket.put(`${base}/objects/pack/canonical.idx`, index);
	cache?.invalidate(gitdir);
	return { packSize: pack.length, objectCount: entries.length };
}
