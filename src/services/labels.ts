/**
 * labels service — repo-scoped issue labels.
 *
 * Mirrors Forgejo `models/repo/label.go` (subset): name + color (hex) +
 * optional description. An issue's `labels` column is a JSON array of label
 * ids; labels are managed here and attached/detached on the issue side.
 */
import type { Db } from "./types";
import { all, run } from "./types";

export interface LabelRow {
	id: string;
	repoId: string;
	name: string;
	color: string;
	description: string;
	created_at: string;
}

export interface CreateLabelInput {
	repoId: string;
	name: string;
	color: string;
	description?: string;
}

/** All labels for a repo, ordered by creation. */
export async function listByRepo(db: Db, repoId: string): Promise<LabelRow[]> {
	return all<LabelRow>(
		db,
		`SELECT * FROM "labels" WHERE "repoId" = ? ORDER BY "created_at" ASC`,
		[repoId],
	);
}

/** Create a label (validates the color is a hex string). */
export async function create(db: Db, input: CreateLabelInput): Promise<LabelRow | null> {
	if (!/^#?[0-9a-fA-F]{6}$/.test(input.color)) return null;
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const row: LabelRow = {
		id,
		repoId: input.repoId,
		name: input.name,
		color: input.color.startsWith("#") ? input.color : `#${input.color}`,
		description: input.description ?? "",
		created_at: now,
	};
	await run(
		db,
		`INSERT INTO "labels" ("id","repoId","name","color","description","created_at") VALUES (?,?,?,?,?,?)`,
		[row.id, row.repoId, row.name, row.color, row.description, row.created_at],
	);
	return row;
}

/** Delete a label (removed from any issue that references it — best-effort). */
export async function remove(db: Db, repoId: string, labelId: string): Promise<boolean> {
	// Detach from issues first, then delete.
	await run(
		db,
		`UPDATE "issues" SET "labels" = '[]' WHERE "repoId" = ? AND instr("labels", ?) > 0`,
		[repoId, labelId],
	);
	await run(db, `DELETE FROM "labels" WHERE "id" = ? AND "repoId" = ?`, [labelId, repoId]);
	return true;
}

/** Resolve label ids → rows (for enriching issue lists). */
export async function byIds(db: Db, ids: string[]): Promise<LabelRow[]> {
	if (ids.length === 0) return [];
	const placeholders = ids.map(() => "?").join(",");
	return all<LabelRow>(db, `SELECT * FROM "labels" WHERE "id" IN (${placeholders})`, ids);
}
