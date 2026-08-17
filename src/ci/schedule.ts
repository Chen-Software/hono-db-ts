/**
 * ci/schedule — turn a push event into a CI run (the server-side dispatch step,
 * mirroring Forgejo's `services/actions` run scheduling).
 *
 * The queue consumer calls this after a `repo.push`: it parses the workflow
 * file discovered at the pushed ref, checks the trigger (`on:`), and records a
 * `queued` run. The run is then handed to a runner via the `ci.run` queue
 * action (or, once a runner is wired, directly).
 */
import type { Db } from "@/services/types";
import { parseWorkflow, workflowMatchesEvent, WORKFLOW_FILE } from "./workflow";
import * as runs from "@/services/workflow-runs";

export interface ScheduleInput {
	repoId: string;
	ref: string;
	commitSha: string;
	workflowYaml: string;
	triggerEvent?: string;
}

/**
 * Parse + filter + record a run. Returns the run id, or `null` when the
 * workflow does not fire for this event (or has no jobs).
 */
export async function scheduleWorkflowRun(db: Db, input: ScheduleInput): Promise<string | null> {
	const cfg = parseWorkflow(input.workflowYaml);
	const event = input.triggerEvent ?? "push";
	if (!workflowMatchesEvent(cfg, event)) return null;
	if (!cfg.jobs || Object.keys(cfg.jobs).length === 0) return null;
	return runs.createRun(db, {
		repoId: input.repoId,
		ref: input.ref,
		commitSha: input.commitSha,
		workflowPath: WORKFLOW_FILE,
		triggerEvent: event,
	});
}
