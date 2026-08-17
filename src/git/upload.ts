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

/** Collect every object reachable from `starts` (commits, trees, blobs). */
async function collectReachable(fs: FsClient, gitdir: string, starts: string[]): Promise<string[]> {
	const seen = new Set<string>();
	const out: string[] = [];
	const queue = [...starts];
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
		}
		// blobs terminate the walk
	}
	return out;
}

/** Build the `info/refs?service=git-upload-pack` advertisement body. */
export async function uploadPackAdvertise(fs: FsClient, gitdir: string): Promise<Uint8Array> {
	const refs = await listRefs(fs, gitdir);
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
		} else if (line.startsWith("done")) {
			done = true;
			break;
		}
	}
	if (wants.length === 0) throw new Error("upload-pack: no want lines in request");
	const allOids = await collectReachable(fs, gitdir, wants);
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
