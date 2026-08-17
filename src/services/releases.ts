/**
 * releases service — repo releases.
 *
 * Mirrors Forgejo `models/repo/release.go` (subset). A release is attached to a
 * git tag (`tag_name` + `target` commit-ish); `draft` / `prerelease` flags
 * control visibility. The service persists release metadata in the `releases`
 * table; the git tag existence is validated by the calling route via the git
 * layer (list/create tag).
 */
import type { Db } from "./types";
import { all, run } from "./types";

export interface ReleaseRow {
	id: string;
	repoId: string;
	publisher_id: string;
	tag_name: string;
	target: string;
	title: string;
	note: string;
	draft: number;
	prerelease: number;
	is_tag: number;
	created_at: string;
	published_at: string | null;
}

export interface CreateReleaseInput {
	repoId: string;
	publisherId: string;
	tagName: string;
	target: string;
	title?: string;
	note?: string;
	draft?: boolean;
	prerelease?: boolean;
}

/** All releases for a repo, newest first. */
export async function listByRepo(db: Db, repoId: string): Promise<ReleaseRow[]> {
	return all<ReleaseRow>(
		db,
		`SELECT * FROM "releases" WHERE "repoId" = ? ORDER BY "created_at" DESC`,
		[repoId],
	);
}

/** Fetch a release by its tag name. */
export async function getByTag(
	db: Db,
	repoId: string,
	tagName: string,
): Promise<ReleaseRow | null> {
	const rows = await all<ReleaseRow>(
		db,
		`SELECT * FROM "releases" WHERE "repoId" = ? AND "tag_name" = ? LIMIT 1`,
		[repoId, tagName],
	);
	return rows[0] ?? null;
}

/** Create a release. Returns null if the tag is already released. */
export async function create(db: Db, input: CreateReleaseInput): Promise<ReleaseRow | null> {
	const existing = await getByTag(db, input.repoId, input.tagName);
	if (existing) return null;
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const row: ReleaseRow = {
		id,
		repoId: input.repoId,
		publisher_id: input.publisherId,
		tag_name: input.tagName,
		target: input.target,
		title: input.title ?? input.tagName,
		note: input.note ?? "",
		draft: input.draft ? 1 : 0,
		prerelease: input.prerelease ? 1 : 0,
		is_tag: 0,
		created_at: now,
		published_at: input.draft ? null : now,
	};
	await run(
		db,
		`INSERT INTO "releases" ("id","repoId","publisher_id","tag_name","target","title","note","draft","prerelease","is_tag","created_at","published_at")
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		[
			row.id, row.repoId, row.publisher_id, row.tag_name, row.target, row.title,
			row.note, row.draft, row.prerelease, row.is_tag, row.created_at, row.published_at,
		],
	);
	return row;
}

/** Delete a release by tag (only the metadata; the git tag is a separate op). */
export async function remove(db: Db, repoId: string, tagName: string): Promise<boolean> {
	await run(db, `DELETE FROM "releases" WHERE "repoId" = ? AND "tag_name" = ?`, [repoId, tagName]);
	return true;
}
