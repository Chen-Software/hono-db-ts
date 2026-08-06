/**
 * Build-time container-runtime detection via Bun macros.
 *
 * Import with `with { type: "macro" }`. `detectContainerCompose()` runs **at
 * build time** — when `scripts/test.ts` is launched by `bun run test` — and
 * returns the available container compose command as an inlined literal, or
 * `undefined` when none is installed.
 *
 * Priority: `container` > `podman` > `docker`. For each runtime we verify both
 * the binary (`<bin> --version`) and its compose subcommand
 * (`<bin> compose --version`) before selecting it. Each check is bounded by a
 * short timeout so a broken/hung CLI (e.g. a docker binary waiting on a dead
 * daemon) fails fast instead of blocking.
 *
 * Usage (in a script or worker that runs at build/runtime):
 *   import { detectContainerCompose } from "./container-compose-runtime" with {
 *     type: "macro",
 *   };
 *   const compose = detectContainerCompose(); // "docker compose" | undefined
 */

import { spawnSync } from "node:child_process";

/** Result of the detection: the selected compose command, or undefined. */
export function detectContainerCompose(): string | undefined {
	const runtimes: Array<{ bin: string; compose: string }> = [
		{ bin: "container", compose: "container compose" },
		{ bin: "podman", compose: "podman compose" },
		{ bin: "docker", compose: "docker compose" },
	];

	for (const { bin, compose } of runtimes) {
		// The binary itself must exist and respond to --version.
		const binCheck = spawnSync(`${bin} --version`, {
			shell: true,
			stdio: "ignore",
			timeout: 5000,
		});
		if (binCheck.error || binCheck.status !== 0) continue;

		// And it must expose a working compose subcommand.
		const composeCheck = spawnSync(`${compose} --version`, {
			shell: true,
			stdio: "ignore",
			timeout: 5000,
		});
		if (composeCheck.error || composeCheck.status !== 0) continue;

		return compose;
	}

	return undefined;
}
