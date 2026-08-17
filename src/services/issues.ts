/**
 * issues service — issues, pull requests (as `is_pull` issues + `pull_requests`
 * rows), comments, labels, and milestones.
 *
 * Mirrors Forgejo `models/repo/issue.go` + `pull.go` + `comment.go` (subset).
 * All queries run through Drizzle's parameterised helpers (`all` / `run`) — no
 * raw `sql.unsafe`. The repo-scoped `{index}` mirrors Forgejo's per-repo issue
 * numbering; state is `open` | `closed`; a pull request is an issue row with
 * `is_pull = 1` plus a `pull_requests` row carrying the head/base branches.
 */
import type { Db } from "./types";
import { all, run } from "./types";

export type IssueState = "open" | "closed";

export interface IssueRow {
	id: string;
	repoId: string;
	posterId: string;
	index: number;
	title: string;
	body: string;
	state: IssueState;
	is_pull: number;
	milestone_id: string | null;
	assignee_id: string | null;
	/** JSON array of label ids. */
	labels: string;
	num_comments: number;
	num_reactions: number;
	closed_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface CommentRow {
	id: string;
	issue_id: string;
	poster_id: string;
	body: string;
	created_at: string;
	updated_at: string;
}

export interface CreateIssueInput {
	repoId: string;
	posterId: string;
	title: string;
	body?: string;
	isPull?: boolean;
}

/** The next issue index for a repo (per-repo numbering, like Forgejo). */
async function nextIndex(db: Db, repoId: string): Promise<number> {
	const rows = await all<{ max: number }>(
		db,
		`SELECT COALESCE(MAX("index"), 0) AS "max" FROM "issues" WHERE "repoId" = ?`,
		[repoId],
	);
	return (rows[0]?.max ?? 0) + 1;
}

/** Create an issue (or, with isPull, the issue half of a pull request). */
export async function create(db: Db, input: CreateIssueInput): Promise<IssueRow> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const index = await nextIndex(db, input.repoId);
	const row: IssueRow = {
		id,
		repoId: input.repoId,
		posterId: input.posterId,
		index,
		title: input.title,
		body: input.body ?? "",
		state: "open",
		is_pull: input.isPull ? 1 : 0,
		milestone_id: null,
		assignee_id: null,
		labels: "[]",
		num_comments: 0,
		num_reactions: 0,
		closed_at: null,
		created_at: now,
		updated_at: now,
	};
	await run(
		db,
		`INSERT INTO "issues" ("id","repoId","posterId","index","title","body","state","is_pull","milestone_id","assignee_id","labels","num_comments","num_reactions","closed_at","created_at","updated_at")
		 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		[
			row.id, row.repoId, row.posterId, row.index, row.title, row.body, row.state,
			row.is_pull, row.milestone_id, row.assignee_id, row.labels, row.num_comments,
			row.num_reactions, row.closed_at, row.created_at, row.updated_at,
		],
	);
	return row;
}

/** List issues for a repo, newest first, with optional state filter + pagination. */
export async function listByRepo(
	db: Db,
	repoId: string,
	opts: { state?: IssueState; page?: number; perPage?: number } = {},
): Promise<{ issues: IssueRow[]; total: number }> {
	const { state, page = 1, perPage = 30 } = opts;
	const where = `"repoId" = ?` + (state ? ` AND "state" = ?` : "");
	const params: unknown[] = [repoId];
	if (state) params.push(state);
	const totalRows = await all<{ n: number }>(db, `SELECT COUNT(*) AS "n" FROM "issues" WHERE ${where}`, params);
	const offset = (page - 1) * perPage;
	const issues = await all<IssueRow>(
		db,
		`SELECT * FROM "issues" WHERE ${where} ORDER BY "index" DESC LIMIT ? OFFSET ?`,
		[...params, perPage, offset],
	);
	return { issues, total: totalRows[0]?.n ?? 0 };
}

/** Fetch a single issue by its per-repo index. */
export async function getByIndex(
	db: Db,
	repoId: string,
	index: number,
): Promise<IssueRow | null> {
	const rows = await all<IssueRow>(
		db,
		`SELECT * FROM "issues" WHERE "repoId" = ? AND "index" = ? LIMIT 1`,
		[repoId, index],
	);
	return rows[0] ?? null;
}

/** Set an issue's state (open/closed). Returns true when a row was updated. */
export async function setState(
	db: Db,
	repoId: string,
	index: number,
	state: IssueState,
): Promise<boolean> {
	const now = new Date().toISOString();
	await run(
		db,
		`UPDATE "issues" SET "state" = ?, "closed_at" = ?, "updated_at" = ? WHERE "repoId" = ? AND "index" = ?`,
		[state, state === "closed" ? now : null, now, repoId, index],
	);
	// A state change always affects the row we already fetched (it exists);
	// re-read to confirm.
	const issue = await getByIndex(db, repoId, index);
	return issue !== null && issue.state === state;
}

/** ----- comments ----- */

/** Add a comment to an issue (increments `num_comments`). */
export async function addComment(
	db: Db,
	repoId: string,
	issueIndex: number,
	posterId: string,
	body: string,
): Promise<CommentRow | null> {
	const issue = await getByIndex(db, repoId, issueIndex);
	if (!issue) return null;
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await run(
		db,
		`INSERT INTO "issue_comments" ("id","issue_id","poster_id","body","created_at","updated_at")
		 VALUES (?,?,?,?,?,?)`,
		[id, issue.id, posterId, body, now, now],
	);
	await run(
		db,
		`UPDATE "issues" SET "num_comments" = "num_comments" + 1, "updated_at" = ? WHERE "id" = ?`,
		[now, issue.id],
	);
	return { id, issue_id: issue.id, poster_id: posterId, body, created_at: now, updated_at: now };
}

/** All comments for an issue, oldest first. */
export async function listComments(
	db: Db,
	issueIndex: number,
	repoId: string,
): Promise<CommentRow[]> {
	const rows = await all<{ id: string }>(
		db,
		`SELECT "id" FROM "issues" WHERE "repoId" = ? AND "index" = ? LIMIT 1`,
		[repoId, issueIndex],
	);
	if (!rows[0]) return [];
	return all<CommentRow>(
		db,
		`SELECT * FROM "issue_comments" WHERE "issue_id" = ? ORDER BY "created_at" ASC`,
		[rows[0].id],
	);
}

/** ----- pull requests ----- */

export interface PullRequestRow {
	id: string;
	issue_id: string;
	head_branch: string;
	base_branch: string;
	head_sha: string | null;
	merged: number;
	merged_by: string | null;
	merged_at: string | null;
	closed_at: string | null;
	created_at: string;
}

/** Create the `pull_requests` half of a pull request (after the issue row). */
export async function createPullRequest(
	db: Db,
	issueId: string,
	headBranch: string,
	baseBranch: string,
	headSha: string | null,
): Promise<PullRequestRow> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const row: PullRequestRow = {
		id,
		issue_id: issueId,
		head_branch: headBranch,
		base_branch: baseBranch,
		head_sha: headSha,
		merged: 0,
		merged_by: null,
		merged_at: null,
		closed_at: null,
		created_at: now,
	};
	await run(
		db,
		`INSERT INTO "pull_requests" ("id","issue_id","head_branch","base_branch","head_sha","merged","merged_by","merged_at","closed_at","created_at")
		 VALUES (?,?,?,?,?,?,?,?,?,?)`,
		[row.id, row.issue_id, row.head_branch, row.base_branch, row.head_sha, row.merged, row.merged_by, row.merged_at, row.closed_at, row.created_at],
	);
	return row;
}

/** The pull-request row for an issue, if any. */
export async function getPullRequestForIssue(
	db: Db,
	issueId: string,
): Promise<PullRequestRow | null> {
	const rows = await all<PullRequestRow>(
		db,
		`SELECT * FROM "pull_requests" WHERE "issue_id" = ? LIMIT 1`,
		[issueId],
	);
	return rows[0] ?? null;
}
