/**
 * upload — git-upload-pack (fetch / clone) for the smart-HTTP v1 protocol.
 *
 * We do NOT negotiate side-band-64k, so the packfile is sent raw (the
 * isomorphic-git client does not demux sidebands, and git CLI accepts raw
 * packs when side-band is absent). `packObjects` only packs the oids you give
 * it, so we first walk the full reachable object graph (commits + trees +
 * blobs) from the requested tips.
 */

import * as git from "isomorphic-git";
import type { FsClient } from "isomorphic-git";
import { band1PktLine, concatBytes, FLUSH, parsePktLines, pktLineStr } from "./protocol";
import { listRefs } from "./refs";

/**
 * Collect every object reachable from `starts` (commits, trees, blobs).
 *
 * `known` is the set of oids the client already has (the `have`s from a fetch).
 * When an oid is in `known` we stop the walk there — the client already has it
 * and its ancestors — so the pack contains only the delta (B7 / P0-6). The
 * conservative first step stops only on exact `have` oids; full transitive
 * ancestry pruning is a later refinement.
 */
async function collectReachable(
	fs: FsClient,
	gitdir: string,
	starts: string[],
	known?: Set<string>,
): Promise<string[]> {
	const seen = new Set<string>();
	const out: string[] = [];
	const queue = [...starts];
	while (queue.length) {
		const oid = queue.pop() as string;
		if (seen.has(oid)) continue;
		seen.add(oid);
		if (known?.has(oid)) continue; // client has this + its ancestors
		out.push(oid);
		const { type, object } = await git.readObject({ fs, gitdir, oid, format: "parsed" });
		if (type === "commit") {
			const commit = object as { tree: string; parent?: string[] };
			queue.push(commit.tree);
			for (const p of commit.parent ?? []) queue.push(p);
		} else if (type === "tree") {
			const entries = (object as Array<{ oid: string }>) ?? [];
			for (const e of entries) queue.push(e.oid);
		}
		// blobs terminate the walk
	}
	return out;
}

/**
 * Add reachable tag objects to `oids` when the client negotiated `include-tag`
 * (B3 / P0-3). For each tag whose peeled target is reachable from the wanted
 * tips, include the tag object itself in the pack.
 */
async function collectIncludedTags(
	fs: FsClient,
	gitdir: string,
	reachable: Set<string>,
	oids: string[],
): Promise<void> {
	for (const t of await git.listTags({ fs, gitdir })) {
		const ref = `refs/tags/${t}`;
		const oid = await git.resolveRef({ fs, gitdir, ref });
		let target = oid;
		try {
			const { type, object } = await git.readObject({ fs, gitdir, oid, format: "parsed" });
			if (type === "tag") target = (object as { object: string }).object;
		} catch {
			// lightweight tag — target is the oid itself
		}
		if (reachable.has(target) || reachable.has(oid)) oids.push(oid);
	}
}

/** Build the `info/refs?service=git-upload-pack` advertisement body. */
export async function uploadPackAdvertise(fs: FsClient, gitdir: string): Promise<Uint8Array> {
	const refs = await listRefs(fs, gitdir);
	console.error(`[adv] gitdir=${gitdir} refs=${refs.length} ${refs.map((r) => r.ref + "=" + r.oid.slice(0, 8)).join(",")} | listBranches=${JSON.stringify(await git.listBranches({ fs, gitdir }).catch(() => "ERR"))}`);
	const chunks: Uint8Array[] = [pktLineStr("# service=git-upload-pack\n"), FLUSH];
	if (refs.length === 0) {
		chunks.push(FLUSH); // empty repo: service line + flush + flush
		return concatBytes(chunks);
	}
	const caps = [
		"side-band-64k",
		"ofs-delta",
		"no-progress",
		"include-tag",
		"agent=codeforge/0.1.0",
	];
	const head = refs.find((r) => r.ref === "HEAD");
	if (head?.symref) caps.push(`symref=${head.ref}:${head.symref}`);
	let first = true;
	for (const r of refs) {
		const line = first ? `${r.oid} ${r.ref}\0${caps.join(" ")}\n` : `${r.oid} ${r.ref}\n`;
		chunks.push(pktLineStr(line));
		first = false;
	}
	chunks.push(FLUSH);
	return concatBytes(chunks);
}

/**
 * Handle the POST `git-upload-pack` body. Parses `want`/`have`/`done` pkt-lines
 * and returns the raw packfile of all objects reachable from the wanted tips.
 */
export async function uploadPackService(fs: FsClient, gitdir: string, body: Uint8Array): Promise<Uint8Array> {
	const decoder = new TextDecoder();
	const wants: string[] = [];
	const haves: string[] = [];
	let includeTag = false;
	let done = false;
	for (const item of parsePktLines(body)) {
		if (item === null) {
			if (done) break;
			continue;
		}
		const line = decoder.decode(item);
		if (line.startsWith("want ")) {
			const parts = line.trim().split(/\s+/);
			if (parts[1]) wants.push(parts[1]);
			// Capabilities (incl. include-tag) ride the first want line.
			if (parts.includes("include-tag")) includeTag = true;
		} else if (line.startsWith("have ")) {
			const oid = line.trim().split(/\s+/)[1];
			if (oid) haves.push(oid);
		} else if (line.startsWith("done")) {
			done = true;
			break;
		}
	}
	if (wants.length === 0) throw new Error("upload-pack: no want lines in request");
	const known = new Set(haves);
	const allOids = await collectReachable(fs, gitdir, wants, known);
	if (includeTag) {
		await collectIncludedTags(fs, gitdir, new Set(allOids), allOids);
	}
	const { packfile } = await git.packObjects({ fs, gitdir, oids: allOids });
	if (!packfile) throw new Error("upload-pack: packObjects returned no packfile");
	// The client always demuxes the result via `GitSideBand.demux`, so the
	// packfile must be side-band-64k framed on band 1 (each pkt-line carries a
	// leading 0x01 byte). Max data per pkt-line is 65520 - 4 (header) - 1
	// (band) = 65515; we use 65515 to stay safely under the 65524 limit.
	const CHUNK = 65515;
	const chunks: Uint8Array[] = [];
	for (let off = 0; off < packfile.length; off += CHUNK) {
		const slice = packfile.subarray(off, Math.min(off + CHUNK, packfile.length));
		chunks.push(band1PktLine(slice));
	}
	chunks.push(FLUSH);
	return concatBytes(chunks);
}
