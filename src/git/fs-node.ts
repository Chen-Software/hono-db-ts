/**
 * fs-node — isomorphic-git FsClient backed by the real filesystem.
 *
 * Used for local `serve` (dev) and for the end-to-end tests. The gitdir passed
 * by the git layer is an absolute path under the configured GIT_ROOT; this fs
 * simply performs real filesystem operations on the exact paths isomorphic-git
 * hands it, so it behaves like a standard git work tree / bare repo.
 */

import {
	chmod,
	lstat,
	mkdir,
	readdir,
	readFile,
	readlink,
	rmdir,
	stat,
	symlink,
	unlink,
	writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import type { FsClient } from "isomorphic-git";

function eNoent(path: string): Error {
	const e = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException;
	e.code = "ENOENT";
	e.errno = -2;
	return e;
}

/** Build a promise-based FsClient over node:fs/promises. */
export function nodeFs(): FsClient {
	return {
		promises: {
			readFile: async (path: string, opts?: { encoding?: string }) => {
				const data = await readFile(path, opts?.encoding ? { encoding: opts.encoding } : undefined);
				return data as unknown as Uint8Array | string;
			},
		writeFile: async (path: string, data: Uint8Array | string) => {
			await mkdir(dirname(path), { recursive: true }).catch(() => {});
			await writeFile(path, data as never);
		},
			unlink: async (path: string) => {
				await unlink(path);
			},
			readdir: async (path: string) => {
				const entries = await readdir(path, { withFileTypes: true });
				return entries.map((e) => e.name) as unknown as string[];
			},
			mkdir: async (path: string) => {
				await mkdir(path, { recursive: true }).catch(() => {});
			},
			rmdir: async (path: string) => {
				await rmdir(path, { recursive: true }).catch(() => {});
			},
			stat: async (path: string) => {
				return (await stat(path)) as unknown as { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean; size: number; mode: number; ino: number; mtimeMs: number; ctimeMs: number };
			},
			lstat: async (path: string) => {
				return (await lstat(path)) as unknown as { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean; size: number; mode: number; ino: number; mtimeMs: number; ctimeMs: number };
			},
			readlink: async (path: string) => (await readlink(path)) as unknown as string,
			symlink: async (target: string, path: string) => {
				await symlink(target, path);
			},
			chmod: async (path: string, mode: number) => {
				await chmod(path, mode);
			},
		},
	} as unknown as FsClient;
}

// Re-export so the lstat import isn't flagged unused in strict setups.
export { eNoent };
