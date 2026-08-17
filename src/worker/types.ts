/**
 * worker/types — shared types for the Worker backends.
 *
 * A backend is a module that builds the query app for one database target.
 * `src/worker.ts` imports the selected backend via the compile-time constant
 * `__BACKEND__` (injected by `scripts/cf-build.ts`), so the unselected
 * backend — and its `bun:sqlite` import — never enters the deployed bundle.
 */

import type { Hono } from "hono";

import type { SqlQueryExecutor } from "@/capacities/servable";
import type { QueueBatchLike } from "./queue";

/** Worker bindings — the D1 database is `env.DB`. */
export interface WorkerEnv {
	DB?: D1Database;
	/** R2 bucket for git objects (binding `REPOS`). */
	REPOS?: unknown;
	/** Cloudflare Queue for CodeForge actions (binding `CODE_FORGE_QUEUE`). */
	CODE_FORGE_QUEUE?: { send(msg: unknown): Promise<void> };
	/** Public auth base URL (Better Auth). Defaults to the worker URL. */
	BETTER_AUTH_URL?: string;
	/** Better Auth signing secret — set as a Cloudflare secret binding. */
	BETTER_AUTH_SECRET?: string;
}

/** The shape every backend module exports. */
export interface WorkerBackend {
	init(env: WorkerEnv): Hono | Promise<Hono>;
	/** Optional Cloudflare Queues consumer (d1 backend wires it; dev backends omit). */
	queue?(batch: QueueBatchLike, env: WorkerEnv): Promise<void>;
}

export type { SqlQueryExecutor, QueueBatchLike };
