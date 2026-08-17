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

/** List advertised refs: HEAD (with symref) followed by each branch. */
export async function listRefs(fs: FsClient, gitdir: string): Promise<AdvertisedRef[]> {
	const branches = await git.listBranches({ fs, gitdir });
	const refs: AdvertisedRef[] = [];
	for (const b of branches) {
		const oid = await git.resolveRef({ fs, gitdir, ref: `refs/heads/${b}` });
		refs.push({ ref: `refs/heads/${b}`, oid });
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
