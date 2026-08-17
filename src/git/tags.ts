/**
 * tags — tag listing + CRUD for the forge UI (releases, tags dropdown).
 *
 * Mirrors Forgejo's `repo_tag.go` / `tag.go`: lightweight + annotated tags,
 * peel annotated tags to their target commit, delete. Uses only isomorphic-git
 * + Web Platform globals (Workers-safe).
 */

import * as git from "isomorphic-git";
import type { FsClient } from "isomorphic-git";

export interface TagInfo {
	name: string;
	/** The (possibly peeled) commit oid the tag points at. */
	oid: string;
	type: "lightweight" | "annotated";
	/** Tag message (annotated tags only). */
	message?: string;
}

export interface CreateTagOpts {
	annotated?: boolean;
	message?: string;
	tagger?: { name: string; email: string };
}

/** List tags, peeling annotated tags to their target commit oid. */
export async function listTags(fs: FsClient, gitdir: string): Promise<TagInfo[]> {
	const names = await git.listTags({ fs, gitdir });
	const out: TagInfo[] = [];
	for (const name of names) {
		const ref = `refs/tags/${name}`;
		const refOid = await git.resolveRef({ fs, gitdir, ref });
		let type: TagInfo["type"] = "lightweight";
		let oid = refOid;
		let message: string | undefined;
		try {
			const { type: objType, object } = await git.readObject({ fs, gitdir, oid: refOid, format: "parsed" });
			if (objType === "tag") {
				type = "annotated";
				const tag = object as { object: string; message?: string };
				oid = tag.object;
				message = tag.message;
			}
		} catch {
			// Lightweight tag — refOid is already the commit.
		}
		out.push({ name, oid, type, message });
	}
	out.sort((a, b) => a.name.localeCompare(b.name));
	return out;
}

/** Resolve a tag (lightweight or annotated) to the commit oid it ultimately points at. */
export async function resolveTag(fs: FsClient, gitdir: string, name: string): Promise<string> {
	const refOid = await git.resolveRef({ fs, gitdir, ref: `refs/tags/${name}` });
	const { type, object } = await git.readObject({ fs, gitdir, oid: refOid, format: "parsed" });
	if (type === "tag") return (object as { object: string }).object;
	return refOid;
}

/** Create a tag. Lightweight writes the ref directly; annotated writes a tag object first. */
export async function createTag(
	fs: FsClient,
	gitdir: string,
	name: string,
	target: string,
	opts: CreateTagOpts = {},
): Promise<TagInfo> {
	// `target` may be a branch/tag name or a raw oid.
	const targetOid = await git.resolveRef({ fs, gitdir, ref: target });
	if (opts.annotated) {
		const tagger = opts.tagger ?? { name: "CodeForge", email: "noreply@codeforge.dev" };
		const message = opts.message ?? `tag ${name}`;
		const tagObject = await git.writeObject({
			fs,
			dir: gitdir,
			gitdir,
			type: "tag",
			object: new TextEncoder().encode(
				`object ${targetOid}\n` +
					`type commit\n` +
					`tag ${name}\n` +
					`tagger ${tagger.name} <${tagger.email}> ${Math.floor(Date.now() / 1000)} +0000\n\n` +
					`${message}\n`,
			),
		});
		await git.writeRef({ fs, gitdir, ref: `refs/tags/${name}`, value: tagObject, force: false });
		return { name, oid: targetOid, type: "annotated", message };
	}
	await git.writeRef({ fs, gitdir, ref: `refs/tags/${name}`, value: targetOid, force: false });
	return { name, oid: targetOid, type: "lightweight" };
}

/** Delete a tag by name. Throws if the ref does not exist. */
export async function deleteTag(fs: FsClient, gitdir: string, name: string): Promise<void> {
	await git.deleteRef({ fs, gitdir, ref: `refs/tags/${name}` });
}
