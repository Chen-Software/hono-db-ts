/**
 * workflow-runs — CI run + step records (mirrors Forgejo `action_run` /
 * `action_task`). The queue consumer (`worker/queue.ts` → `ci/schedule.ts`)
 * records a `queued` run on push; the runner updates status/steps as it goes.
 *
 * Table: `workflow_runs` + `workflow_run_steps` (see drizzle/*.sql).
 */
import type { Db } from "./types";
import { all, run } from "./types";

export interface CreateRunInput {
	repoId: string;
	ref: string;
	commitSha: string;
	workflowPath: string;
	triggerEvent: string;
}

export interface WorkflowRun {
	id: string;
	created_at: string;
	repoId: string;
	ref: string;
	commit_sha: string;
	workflow_path: string;
	trigger_event: string;
	status: string;
	started_at: string | null;
	finished_at: string | null;
	error: string | null;
}

export interface WorkflowStep {
	id: string;
	created_at: string;
	run_id: string;
	name: string;
	status: string;
	started_at: string | null;
	finished_at: string | null;
	log: string;
}

/** Record a queued run for a push. Returns the run id. */
export async function createRun(db: Db, input: CreateRunInput): Promise<string> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await run(
		db,
		`INSERT INTO "workflow_runs" ("id","created_at","repoId","ref","commit_sha","workflow_path","trigger_event","status")
		 VALUES (?,?,?,?,?,?,?,?)`,
		[id, now, input.repoId, input.ref, input.commitSha, input.workflowPath, input.triggerEvent, "queued"],
	);
	return id;
}

/** Fetch a run by id. */
export async function getRun(db: Db, id: string): Promise<WorkflowRun | null> {
	const rows = await all(db, `SELECT * FROM "workflow_runs" WHERE "id" = ? LIMIT 1`, [id]);
	return (rows[0] as WorkflowRun) ?? null;
}

/** List runs for a repo, newest first. */
export async function listRunsByRepo(db: Db, repoId: string): Promise<WorkflowRun[]> {
	const rows = await all(
		db,
		`SELECT * FROM "workflow_runs" WHERE "repoId" = ? ORDER BY "created_at" DESC`,
		[repoId],
	);
	return rows as WorkflowRun[];
}

/** Update a run's status + lifecycle timestamps. */
export async function updateRunStatus(
	db: Db,
	id: string,
	status: "running" | "success" | "failure",
	error?: string,
): Promise<void> {
	const finished = status === "success" || status === "failure" ? new Date().toISOString() : null;
	await run(
		db,
		`UPDATE "workflow_runs" SET "status" = ?, "started_at" = COALESCE("started_at", ?),
		 "finished_at" = ?, "error" = ? WHERE "id" = ?`,
		[status, new Date().toISOString(), finished, error ?? null, id],
	);
}

/** List steps for a run. */
export async function listSteps(db: Db, runId: string): Promise<WorkflowStep[]> {
	const rows = await all(
		db,
		`SELECT * FROM "workflow_run_steps" WHERE "run_id" = ? ORDER BY "created_at" ASC`,
		[runId],
	);
	return rows as WorkflowStep[];
}

/** Append to a step's log. */
export async function appendStepLog(db: Db, stepId: string, line: string): Promise<void> {
	await run(
		db,
		`UPDATE "workflow_run_steps" SET "log" = "log" || ? WHERE "id" = ?`,
		[`\n${line}`, stepId],
	);
}

/** Record a step (with queued status) under a run. */
export async function createStep(
	db: Db,
	runId: string,
	name: string,
): Promise<string> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await run(
		db,
		`INSERT INTO "workflow_run_steps" ("id","created_at","run_id","name","status","log")
		 VALUES (?,?,?,?,?,'')`,
		[id, now, runId, name, "queued"],
	);
	return id;
}
