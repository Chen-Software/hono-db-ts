/**
 * archive — "Download ZIP / TAR.GZ" without a git CLI (P1-3).
 *
 * Walks the tree at a ref and emits a dependency-free archive so it stays
 * Workers-safe (pure Web Platform APIs, no node:* and no third-party zip lib):
 *   - ZIP uses the STORE method (no compression) with a correct CRC-32 and
 *     unix external-attributes so file modes survive the round-trip.
 *   - TAR uses the ustar format, then gzipped with the platform `CompressionStream`.
 *
 * Both paths read objects exclusively through isomorphic-git, so they work
 * identically on the local-fs and R2 backends. Symlinks are stored as symlink
 * entries; submodules (mode 160000) are skipped.
 *
 * Workers-safe: isomorphic-git + Web Platform globals only (no node:* APIs).
 */

import * as git from "isomorphic-git";
import type { FsClient } from "isomorphic-git";
import { batchReadObjects } from "./objects";

export type ArchiveFormat = "zip" | "tar.gz";

interface ArchiveEntry {
	path: string;
	/** Raw bytes for a regular file. */
	data: Uint8Array;
	/** Unix mode (e.g. 0o644 / 0o755). Symlinks use 0o120644. */
	mode: number;
	/** For symlinks: the link target (ignored for regular files). */
	symlink?: string;
}

// ---------------------------------------------------------------------------
// Tree walk
// ---------------------------------------------------------------------------

/** Raw tree entry collected during the metadata walk (body not yet read). */
interface ArchiveMeta {
	path: string;
	oid: string;
	/** Raw unix mode from git (used to detect symlinks / executables). */
	mode: number;
}

/**
 * Recursively walk the tree and collect `(path, oid, mode)` metadata only —
 * NO blob bodies are read here. This lets the caller fan out all blob reads
 * in a single bounded-concurrency batch (see `collectEntries`), instead of
 * issuing one R2 GET per file during the walk (the N-GET problem P2-1 fixes).
 */
async function collectTreeMetas(
	fs: FsClient,
	gitdir: string,
	treeOid: string,
	prefix: string,
	out: ArchiveMeta[],
): Promise<void> {
	const { tree } = await git.readTree({ fs, gitdir, oid: treeOid });
	for (const e of tree) {
		const p = prefix ? `${prefix}/${e.path}` : e.path;
		if (e.type === "tree") {
			await collectTreeMetas(fs, gitdir, e.oid, p, out);
			continue;
		}
		const mode = Number.parseInt(String(e.mode), 8);
		if (mode === 0o160000) continue; // submodule — skip
		out.push({ path: p, oid: e.oid, mode });
	}
}

async function collectEntries(fs: FsClient, gitdir: string, ref: string): Promise<ArchiveEntry[]> {
	const commitOid = await git.resolveRef({ fs, gitdir, ref });
	const { commit } = await git.readCommit({ fs, gitdir, oid: commitOid });
	const metas: ArchiveMeta[] = [];
	await collectTreeMetas(fs, gitdir, commit.tree, "", metas);

	// Batch-read every blob body ONCE (bounded concurrency) — P2-1 latency fix
	// for the archive path, mirroring the diff.ts refactor.
	const blobMap = await batchReadObjects(
		fs,
		gitdir,
		metas.map((m) => m.oid),
	);

	const out: ArchiveEntry[] = [];
	for (const m of metas) {
		const data = blobMap.get(m.oid) ?? new Uint8Array(0);
		if (m.mode === 0o120000) {
			// Symlink: store the target as the entry body, mark as symlink.
			out.push({ path: m.path, data, mode: 0o120644, symlink: new TextDecoder().decode(data) });
		} else {
			out.push({ path: m.path, data, mode: m.mode === 0o100755 ? 0o100755 : 0o100644 });
		}
	}
	return out;
}

export interface ArchiveResult {
	contentType: string;
	body: Uint8Array;
	filename: string;
}

/** Build an archive of `ref` in the requested format. */
export async function archiveRepo(
	fs: FsClient,
	gitdir: string,
	ref: string,
	format: ArchiveFormat,
	repoName = "repo",
): Promise<ArchiveResult> {
	const entries = await collectEntries(fs, gitdir, ref);
	const safeRef = ref.replace(/[^a-zA-Z0-9._-]/g, "-");
	if (format === "tar.gz") {
		const tar = buildTar(entries);
		const gz = await gzip(tar);
		return {
			contentType: "application/gzip",
			body: gz,
			filename: `${repoName}-${safeRef}.tar.gz`,
		};
	}
	return {
		contentType: "application/zip",
		body: buildZip(entries),
		filename: `${repoName}-${safeRef}.zip`,
	};
}

// ---------------------------------------------------------------------------
// ZIP (store method)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function buildZip(entries: ArchiveEntry[]): Uint8Array {
	const enc = new TextEncoder();
	const chunks: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;

	for (const e of entries) {
		const nameBytes = enc.encode(e.path);
		const crc = crc32(e.data);
		const size = e.data.length;

		// Local file header (30 bytes + name).
		const local = new Uint8Array(30 + nameBytes.length);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true); // local file header sig
		lv.setUint16(4, 20, true); // version needed
		lv.setUint16(6, 0, true); // flags
		lv.setUint16(8, 0, true); // method = store
		lv.setUint16(10, 0, true); // mod time
		lv.setUint16(12, 0, true); // mod date
		lv.setUint32(14, crc, true);
		lv.setUint32(18, size, true); // compressed
		lv.setUint32(22, size, true); // uncompressed
		lv.setUint16(26, nameBytes.length, true);
		lv.setUint16(28, 0, true); // extra len
		local.set(nameBytes, 30);

		chunks.push(local, e.data);

		// Central directory header (46 bytes + name).
		const cd = new Uint8Array(46 + nameBytes.length);
		const cv = new DataView(cd.buffer);
		cv.setUint32(0, 0x02014b50, true); // central dir sig
		cv.setUint16(4, 20, true); // version made by
		cv.setUint16(6, 20, true); // version needed
		cv.setUint16(8, 0, true); // flags
		cv.setUint16(10, 0, true); // method
		cv.setUint16(12, 0, true); // mod time
		cv.setUint16(14, 0, true); // mod date
		cv.setUint32(16, crc, true);
		cv.setUint32(20, size, true);
		cv.setUint32(24, size, true);
		cv.setUint16(28, nameBytes.length, true);
		cv.setUint16(30, 0, true); // extra len
		cv.setUint16(32, 0, true); // comment len
		cv.setUint16(34, 0, true); // disk number
		cv.setUint16(36, 0, true); // internal attrs
		cv.setUint32(38, (e.mode & 0xffff) << 16, true); // external attrs (unix mode)
		cv.setUint32(42, offset, true); // local header offset
		cd.set(nameBytes, 46);
		central.push(cd);

		offset += local.length + e.data.length;
	}

	const cdStart = offset;
	let cdSize = 0;
	for (const c of central) {
		chunks.push(c);
		cdSize += c.length;
	}

	// End of central directory (22 bytes).
	const eocd = new Uint8Array(22);
	const ev = new DataView(eocd.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(4, 0, true); // disk num
	ev.setUint16(6, 0, true); // disk with cd
	ev.setUint16(8, entries.length, true); // entries this disk
	ev.setUint16(10, entries.length, true); // total entries
	ev.setUint32(12, cdSize, true);
	ev.setUint32(16, cdStart, true);
	ev.setUint16(20, 0, true); // comment len
	chunks.push(eocd);

	return concat(chunks);
}

// ---------------------------------------------------------------------------
// TAR (ustar) + gzip
// ---------------------------------------------------------------------------

function octal(n: number, width: number): Uint8Array {
	let s = Math.trunc(n).toString(8);
	while (s.length < width - 1) s = "0" + s;
	s = s.slice(0, width - 1) + "\0";
	return new TextEncoder().encode(s);
}

function buildTar(entries: ArchiveEntry[]): Uint8Array {
	const enc = new TextEncoder();
	const blocks: Uint8Array[] = [];

	const header = (e: ArchiveEntry): Uint8Array => {
		const buf = new Uint8Array(512);
		const size = e.symlink ? e.symlink.length : e.data.length;
		const typeflag = e.symlink ? "2" : "0";
		buf.set(enc.encode(e.path).subarray(0, 100), 0);
		buf.set(octal(e.mode, 8), 100); // mode
		buf.set(octal(0, 8), 108); // uid
		buf.set(octal(0, 8), 116); // gid
		buf.set(octal(size, 12), 124); // size
		buf.set(octal(0, 12), 136); // mtime
		buf[156] = typeflag.charCodeAt(0);
		if (e.symlink) buf.set(enc.encode(e.symlink).subarray(0, 100), 157);
		buf.set(enc.encode("ustar"), 257);
		buf[263] = 0;
		buf.set(enc.encode("00"), 263); // version (already null-terminated)
		buf.set(enc.encode("codeforge").subarray(0, 32), 265); // uname
		buf.set(enc.encode("codeforge").subarray(0, 32), 297); // gname
		// Checksum: sum all bytes with the checksum field blanked to spaces.
		buf.fill(0x20, 148, 156);
		let sum = 0;
		for (let i = 0; i < 512; i++) sum += buf[i];
		buf.set(octal(sum, 8), 148);
		return buf;
	};

	for (const e of entries) {
		blocks.push(header(e));
		const body = e.symlink ? enc.encode(e.symlink) : e.data;
		blocks.push(body);
		// Pad to a 512-byte boundary.
		const pad = (512 - (body.length % 512)) % 512;
		if (pad) blocks.push(new Uint8Array(pad));
	}
	// Two trailing zero blocks.
	blocks.push(new Uint8Array(1024));
	return concat(blocks);
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
	const cs = new CompressionStream("gzip");
	const writer = cs.writable.getWriter();
	await writer.write(bytes);
	await writer.close();
	const ab = await new Response(cs.readable).arrayBuffer();
	return new Uint8Array(ab);
}

// ---------------------------------------------------------------------------
// Small buffer utilities
// ---------------------------------------------------------------------------

function concat(chunks: Uint8Array[]): Uint8Array {
	let len = 0;
	for (const c of chunks) len += c.length;
	const out = new Uint8Array(len);
	let off = 0;
	for (const c of chunks) {
		out.set(c, off);
		off += c.length;
	}
	return out;
}
