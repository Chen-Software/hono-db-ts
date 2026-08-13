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

/** Worker bindings — the D1 database is `env.DB`. */
export interface WorkerEnv {
	DB?: D1Database;
}

/** The shape every backend module exports. */
export interface WorkerBackend {
	init(env: WorkerEnv): Hono | Promise<Hono>;
}

export type { SqlQueryExecutor };
