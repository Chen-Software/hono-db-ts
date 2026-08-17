/**
 * refs — list the refs of a bare repo for the smart-HTTP advertisement.
 *
 * Reads the branch list + HEAD symref via isomorphic-git. The advertisement
 * puts the HEAD entry first with a `symref=` capability so clients know the
 * default branch (mirrors Forgejo/GitHub behavior).
 */

import * as git from "isomorphic-git";
import type { FsClient } from "isomorphic-git";

export interface AdvertisedRef {
	ref: string;
	oid: string;
	/** Set on HEAD to point at its underlying branch, e.g. "refs/heads/main". */
	symref?: string;
}

/** List advertised refs: HEAD (with symref), each branch, then each tag. */
export async function listRefs(fs: FsClient, gitdir: string): Promise<AdvertisedRef[]> {
	// A fresh bare repo (first push) has no refs yet — `git.listBranches`
	// throws `Could not find refs/heads/main` because HEAD is a symref to a
	// not-yet-created branch. Treat that as "no branches" so the advertisement
	// can return an empty ref list (git clients expect this for a first push).
	let branches: string[] = [];
	try {
		branches = await git.listBranches({ fs, gitdir });
	} catch {
		branches = [];
	}
	const refs: AdvertisedRef[] = [];
	for (const b of branches) {
		try {
			const oid = await git.resolveRef({ fs, gitdir, ref: `refs/heads/${b}` });
			refs.push({ ref: `refs/heads/${b}`, oid });
		} catch {
			// Skip an unresolvable branch rather than failing the whole ad.
		}
	}

	// Tags (B3): advertise each tag, and peel annotated tags to their target
	// commit with a `refs/tags/<name>^{}` line (mirrors Forgejo/GitHub).
	let tags: string[] = [];
	try {
		tags = await git.listTags({ fs, gitdir });
	} catch {
		tags = [];
	}
	for (const t of tags) {
		const ref = `refs/tags/${t}`;
		const oid = await git.resolveRef({ fs, gitdir, ref });
		refs.push({ ref, oid });
		try {
			const { type, object } = await git.readObject({ fs, gitdir, oid, format: "parsed" });
			if (type === "tag") {
				const target = (object as { object: string }).object;
				refs.push({ ref: `${ref}^{}`, oid: target });
			}
		} catch {
			// Lightweight tag — nothing to peel.
		}
	}

	let headOid: string | null = null;
	let symref: string | undefined;
	try {
		headOid = await git.resolveRef({ fs, gitdir, ref: "HEAD" });
		const branch = await git.currentBranch({ fs, gitdir, fullname: true });
		if (branch) symref = branch;
	} catch {
		headOid = null;
	}

	if (headOid) {
		refs.unshift({ ref: "HEAD", oid: headOid, symref });
	}
	return refs;
}
