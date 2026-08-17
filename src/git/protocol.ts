/**
 * protocol — git "smart HTTP" v1 pkt-line primitives.
 *
 * We implement the v1 protocol WITHOUT side-band-64k: the server sends the
 * packfile raw (no sideband framing). This is the simplest correct framing
 * and is understood by both the isomorphic-git client (which does NOT demux
 * sidebands) and the real git CLI (which falls back to raw packs when
 * side-band is not negotiated). All lengths are hex-encoded 4-byte headers.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A flush-pkt: `0000`. */
export const FLUSH = encoder.encode("0000");

/** The 40-char all-zero object id used to signal a ref deletion. */
export const ZERO_OID = "0".repeat(40);

/** Encode a single pkt-line from raw bytes (4-hex length header + data). */
export function pktLine(data: Uint8Array): Uint8Array {
	const len = data.length + 4;
	const header = encoder.encode(len.toString(16).padStart(4, "0"));
	const out = new Uint8Array(4 + data.length);
	out.set(header, 0);
	out.set(data, 4);
	return out;
}

/** Convenience: pkt-line from a UTF-8 string. */
export function pktLineStr(s: string): Uint8Array {
	return pktLine(encoder.encode(s));
}

/**
 * Wrap `data` in a side-band-64k pkt-line on band 1 (the packfile / report
 * data channel). isomorphic-git's `GitSideBand.demux` routes any pkt-line whose
 * first payload byte is not 1/2/3 into the *packetlines* stream, so the
 * receive-pack report-status and the upload-pack packfile MUST both be framed
 * on band 1 or the client demuxes them into the wrong sink and sees an empty
 * pack / empty report.
 */
export function band1PktLine(data: Uint8Array): Uint8Array {
	return pktLine(concatBytes([new Uint8Array([1]), data]));
}

/** Convenience: side-band-64k pkt-line on band 1 from a UTF-8 string. */
export function band1PktLineStr(s: string): Uint8Array {
	return band1PktLine(encoder.encode(s));
}

/** Concatenate a list of byte chunks. */
export function concatBytes(chunks: Uint8Array[]): Uint8Array {
	let total = 0;
	for (const c of chunks) total += c.length;
	const out = new Uint8Array(total);
	let off = 0;
	for (const c of chunks) {
		out.set(c, off);
		off += c.length;
	}
	return out;
}

/**
 * Parse pkt-lines from a body. Yields each data section as a Uint8Array, and
 * `null` for a flush-pkt (`0000`). Stops at the end of the input.
 */
export function* parsePktLines(body: Uint8Array): Generator<Uint8Array | null> {
	let i = 0;
	while (i + 4 <= body.length) {
		const hex = decoder.decode(body.subarray(i, i + 4));
		const len = Number.parseInt(hex, 16);
		if (len === 0) {
			yield null;
			i += 4;
			continue;
		}
		if (len < 4 || i + len > body.length) break;
		yield body.subarray(i + 4, i + len);
		i += len;
	}
}

/** Hex-encode a byte array (used for pack checksum → filename). */
export function toHex(bytes: Uint8Array): string {
	let s = "";
	for (const b of bytes) s += b.toString(16).padStart(2, "0");
	return s;
}
