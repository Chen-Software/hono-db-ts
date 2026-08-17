/**
 * fs-r2 — isomorphic-git FsClient backed by a Cloudflare R2 bucket.
 *
 * Maps every git path to an R2 object key: a logical gitdir like
 * `owner/repo.git` becomes the key prefix `owner/repo.git/...`. R2 has no real
 * directories, so directories are emulated: a "file" is an exact key, a "dir"
 * is any key under `<path>/`. mkdir/rmdir are no-ops (writing a file under a
 * prefix makes the parent appear automatically). Used on Cloudflare Workers,
 * where the bucket arrives as the `env.REPOS` binding.
 */

import type { FsClient } from "isomorphic-git";

/** Minimal structural type for the parts of R2 we use (avoids a hard dep on
 *  @cloudflare/workers-types, which is not installed in this repo). */
export interface R2Like {
	head(key: string): Promise<{ size: number } | null>;
	get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; size?: number } | null>;
	put(key: string, value: Uint8Array | string | ArrayBuffer): Promise<unknown>;
	delete(key: string): Promise<void>;
	list(opts: {
		prefix?: string;
		delimiter?: string;
		cursor?: string;
		limit?: number;
	}): Promise<{
		objects: Array<{ key: string; size?: number }>;
		delimitedPrefixes: string[];
		truncated: boolean;
		cursor?: string;
	}>;
}

function keyOf(p: string): string {
	return p.replace(/^\/+/, "");
}

function eNoent(path: string): Error {
	const e = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException;
	e.code = "ENOENT";
	e.errno = -2;
	return e;
}

/** Build an FsClient over an R2 bucket. */
export function r2Fs(bucket: R2Like): FsClient {
	async function existsAsFile(key: string): Promise<boolean> {
		const head = await bucket.head(key);
		return head != null;
	}
	async function hasChildren(prefix: string): Promise<boolean> {
		const res = await bucket.list({ prefix, delimiter: "/", limit: 1 });
		return res.objects.length > 0 || res.delimitedPrefixes.length > 0;
	}
	return {
		promises: {
			readFile: async (path: string, opts?: { encoding?: string }) => {
				const obj = await bucket.get(keyOf(path));
				if (!obj) throw eNoent(path);
				const bytes = new Uint8Array(await obj.arrayBuffer());
				if (opts?.encoding) return new TextDecoder().decode(bytes);
				return bytes;
			},
			writeFile: async (path: string, data: Uint8Array | string) => {
				await bucket.put(keyOf(path), data as never);
			},
			unlink: async (path: string) => {
				await bucket.delete(keyOf(path));
			},
			readdir: async (path: string) => {
				const prefix = keyOf(path).replace(/\/?$/, "/");
				const names = new Set<string>();
				let cursor: string | undefined;
				do {
					const res = await bucket.list({ prefix, delimiter: "/", cursor });
					for (const o of res.objects) names.add(o.key.slice(prefix.length));
					for (const dp of res.delimitedPrefixes) names.add(dp.slice(prefix.length).replace(/\/$/, ""));
					cursor = res.truncated ? res.cursor : undefined;
				} while (cursor);
				return [...names] as unknown as string[];
			},
			mkdir: async () => {
				// No-op: R2 directories are implicit prefixes.
			},
			rmdir: async () => {
				// No-op: child objects are deleted individually by unlink.
			},
			stat: async (path: string) => {
				const key = keyOf(path);
				if (await existsAsFile(key)) {
					const size = (await bucket.head(key))!.size;
					return {
						isFile: () => true,
						isDirectory: () => false,
						isSymbolicLink: () => false,
						size,
						mode: 0o100644,
						ino: 0,
						mtimeMs: 0,
						ctimeMs: 0,
					};
				}
				if (await hasChildren(key.replace(/\/?$/, "/"))) {
					return {
						isFile: () => false,
						isDirectory: () => true,
						isSymbolicLink: () => false,
						size: 0,
						mode: 0o040000,
						ino: 0,
						mtimeMs: 0,
						ctimeMs: 0,
					};
				}
				throw eNoent(path);
			},
			lstat: async (path: string) => {
				// Bare repos use no symlinks; treat like stat.
				return (await (r2Fs(bucket).promises as any).stat(path)) as never;
			},
			readlink: async (path: string) => {
				throw eNoent(path);
			},
			symlink: async () => {
				throw new Error("symlinks not supported on R2 backend");
			},
			chmod: async () => {
				// No-op.
			},
		},
	} as unknown as FsClient;
}
