/**
 * backend — resolves a (owner, repo) pair to a gitdir + FsClient, and lazily
 * initializes a bare repository on first push.
 *
 * Two concrete backends:
 *   - localGitBackend(root)  → node:fs, gitdir = `${root}/${owner}/${repo}.git`
 *   - r2GitBackend(bucket)   → R2,   gitdir = `${owner}/${repo}.git` (logical)
 *
 * The git layer stays identical; only the storage behind `fs` differs, which
 * is exactly the Forgejo model (git objects live on disk / in object storage,
 * the `Repository` DB row is just the catalog).
 */

import * as git from "isomorphic-git";
import type { FsClient } from "isomorphic-git";
import { nodeFs } from "./fs-node";
import { r2Fs, type R2Like } from "./fs-r2";

export interface GitBackend {
	/** "r2" (Cloudflare) or "local" (dev/test). */
	readonly kind: "r2" | "local";
	/** The gitdir path isomorphic-git should use for this repo. */
	gitdirFor(owner: string, repo: string): string;
	/** The FsClient that maps git paths to the storage backend. */
	fsFor(owner: string, repo: string): FsClient;
	/** Create the bare repo if it does not yet exist (idempotent). */
	ensureRepo(owner: string, repo: string): Promise<void>;
}

/** Local disk backend (dev `serve` + tests). */
export function localGitBackend(root: string): GitBackend {
	const fs = nodeFs();
	const dir = (owner: string, repo: string) => `${root.replace(/\/$/, "")}/${owner}/${repo}.git`;
	return {
		kind: "local",
		gitdirFor: dir,
		fsFor: () => fs,
		async ensureRepo(owner, repo) {
			const d = dir(owner, repo);
			try {
				await fs.promises.stat(d + "/HEAD");
				return;
			} catch {
				/* not initialized yet */
			}
			await git.init({ fs, gitdir: d, bare: true, defaultBranch: "main" });
		},
	};
}

/** Cloudflare R2 backend (production Worker). */
export function r2GitBackend(bucket: R2Like): GitBackend {
	const fs = r2Fs(bucket);
	const dir = (owner: string, repo: string) => `${owner}/${repo}.git`;
	return {
		kind: "r2",
		gitdirFor: dir,
		fsFor: () => fs,
		async ensureRepo(owner, repo) {
			const d = dir(owner, repo);
			try {
				await fs.promises.stat(d + "/HEAD");
				return;
			} catch {
				/* not initialized yet */
			}
			await git.init({ fs, gitdir: d, bare: true, defaultBranch: "main" });
		},
	};
}
