/**
 * receive — git-receive-pack (push) for the smart-HTTP v1 protocol.
 *
 * No side-band-64k: the client sends the commands (pkt-lines) followed by a
 * raw packfile; we unpack the pack into the object store with `indexPack`,
 * update each ref, and return a raw `report-status`. This matches what both
 * the isomorphic-git client and git CLI expect for a v1 push.
 */

import * as git from "isomorphic-git";
import type { FsClient } from "isomorphic-git";
import { join } from "node:path";
import { band1PktLine, concatBytes, FLUSH, pktLineStr, toHex, ZERO_OID } from "./protocol";
import { listRefs } from "./refs";

/** Build the `info/refs?service=git-receive-pack` advertisement body. */
export async function receivePackAdvertise(fs: FsClient, gitdir: string): Promise<Uint8Array> {
	const refs = await listRefs(fs, gitdir);
	const chunks: Uint8Array[] = [pktLineStr("# service=git-receive-pack\n"), FLUSH];
	if (refs.length === 0) {
		chunks.push(FLUSH);
		return concatBytes(chunks);
	}
	const caps = ["report-status", "side-band-64k", "ofs-delta", "agent=codeforge/0.1.0"];
	let first = true;
	for (const r of refs) {
		const line = first ? `${r.oid} ${r.ref}\0${caps.join(" ")}\n` : `${r.oid} ${r.ref}\n`;
		chunks.push(pktLineStr(line));
		first = false;
	}
	chunks.push(FLUSH);
	return concatBytes(chunks);
}

interface PushCommand {
	oldoid: string;
	newoid: string;
	ref: string;
}

export interface ReceiveResult {
	/** The raw report-status pkt-line body. */
	report: Uint8Array;
	/** The accepted (non-deletion) ref updates — what a `repo.push` event needs. */
	commands: PushCommand[];
}

/**
 * Handle the POST `git-receive-pack` body: parse the command pkt-lines, write
 * the trailing raw packfile into `objects/pack/`, index it, and update refs.
 */
export async function receivePackService(fs: FsClient, gitdir: string, body: Uint8Array): Promise<ReceiveResult> {
	const decoder = new TextDecoder();
	const commands: PushCommand[] = [];
	let i = 0;
	let packOffset = -1;
	while (i + 4 <= body.length) {
		const hex = decoder.decode(body.subarray(i, i + 4));
		const len = Number.parseInt(hex, 16);
		if (len === 0) {
			packOffset = i + 4; // flush terminates the command section
			break;
		}
		if (len < 4) break;
		const raw = decoder.decode(body.subarray(i + 4, i + len));
		// The first command line is "<old> <new> <ref>\0<capabilities>"; the
		// NUL separates the ref name from the capability list, so split there
		// and parse only the part before it. Later lines end in a bare LF.
		const nulIdx = raw.indexOf("\0");
		const cmdPart = (nulIdx >= 0 ? raw.slice(0, nulIdx) : raw).replace(/\n$/, "");
		const m = cmdPart.match(/^([0-9a-f]{40}) ([0-9a-f]{40}) (.+)$/);
		if (m) commands.push({ oldoid: m[1], newoid: m[2], ref: m[3] });
		i += len;
	}
	const packBytes = packOffset > 0 ? body.subarray(packOffset) : new Uint8Array(0);

	if (packBytes.length > 0) {
		const sha = toHex(packBytes.subarray(packBytes.length - 20));
		// `filepath` is relative to gitdir (what indexPack expects); the file
		// itself must be written at the absolute path under gitdir so that both
		// the local-fs and R2 backends resolve it consistently.
		const relPath = join("objects", "pack", `pack-${sha}.pack`);
		const absPath = join(gitdir, relPath);
		await fs.promises.mkdir(join(gitdir, "objects", "pack"), { recursive: true } as never).catch(() => {});
		await fs.promises.writeFile(absPath, packBytes);
		await git.indexPack({ fs, dir: gitdir, gitdir, filepath: relPath });
	}

	const results: string[] = [];
	for (const c of commands) {
		if (c.newoid === ZERO_OID) {
			// ref deletion — not supported in this MVP; report ok without action
			results.push(`ok ${c.ref}`);
			continue;
		}
		await git.writeRef({ fs, gitdir, ref: c.ref, value: c.newoid, force: true });
		results.push(`ok ${c.ref}`);
	}

	// The client always runs `GitSideBand.demux` on the receive-pack result,
	// which strips the band byte and feeds `parseReceivePackResponse` a
	// pkt-line stream. So each report-status line must be DOUBLE-framed: a
	// pkt-line of the line text, then side-band-64k framed on band 1 (matching
	// what real git-http-backend sends). A bare (single-framed) line makes the
	// client re-parse "unpa" as a length → NaN → infinite loop.
	const report = concatBytes([
		band1PktLine(pktLineStr("unpack ok\n")),
		...results.map((r) => band1PktLine(pktLineStr(`${r}\n`))),
		FLUSH,
	]);
	return { report, commands };
}
