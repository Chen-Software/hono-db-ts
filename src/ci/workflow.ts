/**
 * ci/workflow — CodeForge CI workflow parsing (`.codeforge-ci.yml`).
 *
 * A GitHub-Actions / Forgejo-Actions-compatible subset: `on` (trigger events),
 * `jobs.<id>.runs-on` (runner labels), and `steps` (each either `run:` a shell
 * command or `uses:` a reusable action). Parsing is pure (js-yaml) and
 * Workers-safe, so it runs identically in the queue consumer (Worker) and in
 * tests.
 */
import { load } from "js-yaml";

export interface WorkflowStep {
	name?: string;
	/** Inline shell command. */
	run?: string;
	/** Reusable action reference, e.g. `actions/checkout@v4`. */
	uses?: string;
	with?: Record<string, unknown>;
	env?: Record<string, string>;
	if?: string;
}

export interface WorkflowJob {
	"runs-on"?: string | string[];
	steps?: WorkflowStep[];
	env?: Record<string, string>;
}

export interface WorkflowConfig {
	/** The workflow trigger — mirrors the workflow file's `on:` key. */
	on?: string | string[] | Record<string, unknown>;
	jobs?: Record<string, WorkflowJob>;
}

/** The workflow file the forge looks for at the repo root. */
export const WORKFLOW_FILE = ".codeforge-ci.yml";
/** Forgejo-compatible discovery paths (the root file is tried first). */
export const WORKFLOW_DIRS = [WORKFLOW_FILE, ".codeforge/workflows", ".forgejo/workflows", ".gitea/workflows"];

export class WorkflowParseError extends Error {}

/** Parse workflow YAML into a validated config. */
export function parseWorkflow(yaml: string): WorkflowConfig {
	let raw: unknown;
	try {
		raw = load(yaml) as unknown;
	} catch (e) {
		throw new WorkflowParseError(`invalid workflow YAML: ${(e as Error).message}`);
	}
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		throw new WorkflowParseError("workflow root must be a YAML mapping");
	}
	const cfg = raw as Record<string, unknown>;
	return {
		on: normalizeOn(cfg["on"] ?? cfg.on),
		jobs: (cfg.jobs ?? {}) as Record<string, WorkflowJob>,
	};
}

function normalizeOn(on: unknown): WorkflowConfig["on"] {
	if (typeof on === "string") return on;
	if (Array.isArray(on)) return on.map(String);
	if (on && typeof on === "object") return on as Record<string, unknown>;
	return undefined;
}

/** Does this workflow fire for the given trigger event (e.g. `"push"`)? */
export function workflowMatchesEvent(cfg: WorkflowConfig, event: string): boolean {
	const on = cfg.on;
	if (on == null) return false;
	if (typeof on === "string") return on === event;
	if (Array.isArray(on)) return on.includes(event);
	return Object.prototype.hasOwnProperty.call(on, event);
}
