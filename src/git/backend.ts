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
import { canonicalizeRepo, PackIndexCache } from "./pack";

export interface GitBackend {
	/** "r2" (Cloudflare) or "local" (dev/test). */
	readonly kind: "r2" | "local";
	/** The gitdir path isomorphic-git should use for this repo. */
	gitdirFor(owner: string, repo: string): string;
	/** The FsClient that maps git paths to the storage backend. */
	fsFor(owner: string, repo: string): FsClient;
	/** Create the bare repo if it does not yet exist (idempotent). */
	ensureRepo(owner: string, repo: string): Promise<void>;
	/**
	 * P2-1: rebuild the canonical pack + index after a push (R2 only). Local
	 * backend leaves this undefined — disk reads are cheap.
	 */
	canonicalize?(fs: FsClient, gitdir: string): Promise<void>;
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

/** Cloudflare R2 backend (production Worker).
 *
 *  P2-1: carries the in-isolate pack LRU (`packCache`), which the FsClient
 *  uses to serve object reads from the canonical pack, and which the
 *  receive path invalidates after canonicalizing a push. */
export function r2GitBackend(bucket: R2Like): GitBackend & { packCache: PackIndexCache } {
	const packCache = new PackIndexCache(bucket);
	const fs = r2Fs(bucket, packCache);
	const dir = (owner: string, repo: string) => `${owner}/${repo}.git`;
	return {
		kind: "r2",
		gitdirFor: dir,
		fsFor: () => fs,
		packCache,
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
		// P2-1: after every push, rebuild the canonical pack + index so object
		// reads come from the pack (1-2 GETs per repo) instead of loose objects.
		async canonicalize(_fs, gitdir) {
			await canonicalizeRepo(bucket, fs, gitdir, packCache);
		},
	};
}
