/**
 * Postgres integration-test setup: start a local Postgres via the container
 * runtime's compose.
 *
 * Detects the available container runtime (priority `container` > `podman` >
 * `docker`) using the build-time macro and runs `<runtime> compose up -d`.
 * This is intended to be referenced by `INTEGRATION_TEST_SETUP_SCRIPT` (e.g.
 * `scripts/postgres-container-setup.ts`) and executed by `scripts/test.ts`.
 *
 * Exit codes:
 *   0   container up succeeded, OR no runtime was found (the caller decides
 *       whether a missing DB is fatal — here we just report and exit 0 so a
 *       CI-provided Postgres can be used instead).
 *   1   a runtime was found but `compose up -d` failed.
 *
 * Usage:
 *   bun run scripts/postgres-container-setup.ts
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { detectContainerCompose } from "../src/macros/container-compose-runtime" with {
	type: "macro",
};

const root = resolve(import.meta.dir, "..");

const compose = detectContainerCompose();

if (!compose) {
	console.log(
		"[setup] no container runtime with compose detected " +
			"(container/podman/docker); skipping — ensure a Postgres is already reachable.",
	);
	process.exit(0);
}

console.log(`[setup] running: ${compose} up -d`);
const result = spawnSync(`${compose} up -d`, {
	cwd: root,
	stdio: "inherit",
	shell: true,
});

if (result.error || result.signal || result.status !== 0) {
	console.error(`[setup] '${compose} up -d' failed:`);
	if (result.error) console.error(`  error: ${result.error.message}`);
	if (result.signal === "SIGTERM") {
		console.error(
			"  timed out. Check the container daemon is running " +
				"(Docker Desktop / colima / podman / the `container` service), " +
				"that the image can be pulled, and that port 5432 is free.",
		);
	} else if (result.status !== 0) {
		console.error(`  exited with status ${result.status}`);
	}
	process.exit(result.status ?? 1);
}

process.exit(0);
