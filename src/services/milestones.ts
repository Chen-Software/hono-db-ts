/**
 * milestones service — repo-scoped milestones.
 *
 * Mirrors Forgejo `models/repo/milestone.go` (subset): title + description +
 * optional due date, with an open/closed state. Issues reference a milestone by
 * `milestone_id`.
 */
import type { Db } from "./types";
import { all, run } from "./types";

export interface MilestoneRow {
	id: string;
	repoId: string;
	title: string;
	description: string;
	state: "open" | "closed";
	due_date: string | null;
	created_at: string;
	updated_at: string;
}

export interface CreateMilestoneInput {
	repoId: string;
	title: string;
	description?: string;
	dueDate?: string | null;
}

/** All milestones for a repo. */
export async function listByRepo(db: Db, repoId: string): Promise<MilestoneRow[]> {
	return all<MilestoneRow>(
		db,
		`SELECT * FROM "milestones" WHERE "repoId" = ? ORDER BY "created_at" ASC`,
		[repoId],
	);
}

/** Create a milestone. */
export async function create(db: Db, input: CreateMilestoneInput): Promise<MilestoneRow> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const row: MilestoneRow = {
		id,
		repoId: input.repoId,
		title: input.title,
		description: input.description ?? "",
		state: "open",
		due_date: input.dueDate ?? null,
		created_at: now,
		updated_at: now,
	};
	await run(
		db,
		`INSERT INTO "milestones" ("id","repoId","title","description","state","due_date","created_at","updated_at")
		 VALUES (?,?,?,?,?,?,?,?)`,
		[row.id, row.repoId, row.title, row.description, row.state, row.due_date, row.created_at, row.updated_at],
	);
	return row;
}
