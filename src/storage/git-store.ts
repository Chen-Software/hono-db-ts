import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
	decodeJson,
	matchesFilter,
	type Store,
	StoreError,
	type StoreObject,
	type StoreQuery,
} from "./store";

const exec = promisify(execFile);

/**
 * `GitStore` — persistence via a git repository, on a dedicated ORPHAN branch.
 *
 * This is the "store in the same code repo, but on a separate orphan branch"
 * idea made safe: `GitStore` owns its OWN repo at `rootDir` (it `git init`s if
 * absent), so it never touches the user's main working tree. `put` writes the
 * blob and commits it to `<branch>`; `get`/`list`/`query` read committed state.
 * The result is a git-compatible, content-addressed, versioned object store —
 * each `put`/`delete` is a real commit you can branch, diff, and clone.
 *
 * (For a truly separate history per model, pass a `branch` per model.)
 */
export class GitStore implements Store {
	readonly name: string;
	constructor(
		private rootDir: string,
		private branch = "store",
		name = "git",
	) {
		this.name = name;
	}

	private git(args: string[]): Promise<string> {
		return exec("git", args, { cwd: this.rootDir })
			.then((r) => r.stdout.trim())
			.catch((e) => {
				throw new StoreError(this.name, args.join(" "), undefined, e);
			});
	}

	private resolve(key: string): string {
		const full = path.resolve(this.rootDir, key);
		if (full !== this.rootDir && !full.startsWith(this.rootDir + path.sep)) {
			throw new StoreError(this.name, "resolve", key, "path escapes rootDir");
		}
		return full;
	}

	/** `git init` (if needed) and ensure we are on the orphan `<branch>`. */
	private async ensure(): Promise<void> {
		await fs.mkdir(this.rootDir, { recursive: true });
		if (!(await this.exists(".git"))) await this.git(["init", "-q"]);
		const hasBranch = await this.git([
			"rev-parse",
			"--verify",
			`refs/heads/${this.branch}`,
		])
			.then(() => true)
			.catch(() => false);
		if (!hasBranch) {
			await this.git(["checkout", "--orphan", this.branch]);
			await this.git(["rm", "-rf", "--cached", "."]).catch(() => {});
			await this.git([
				"commit",
				"--allow-empty",
				"-q",
				"-m",
				"init store branch",
			]);
		} else {
			const cur = await this.git(["rev-parse", "--abbrev-ref", "HEAD"]);
			if (cur !== this.branch) await this.git(["checkout", "-q", this.branch]);
		}
	}

	private async exists(p: string): Promise<boolean> {
		try {
			await fs.stat(path.join(this.rootDir, p));
			return true;
		} catch {
			return false;
		}
	}

	async get(key: string): Promise<StoreObject | undefined> {
		const full = this.resolve(key);
		try {
			const data = await fs.readFile(full);
			return { key, data };
		} catch (e: any) {
			if (e?.code === "ENOENT") return undefined;
			throw new StoreError(this.name, "get", key, e);
		}
	}

	async put(key: string, data: Uint8Array): Promise<void> {
		await this.ensure();
		const full = this.resolve(key);
		await fs.mkdir(path.dirname(full), { recursive: true });
		await fs.writeFile(full, data);
		await this.git(["add", key]);
		await this.git(["commit", "-q", "-m", `put ${key}`]);
	}

	async delete(key: string): Promise<void> {
		await this.ensure();
		await this.git(["rm", "-f", key]).catch(() => {});
		await this.git(["commit", "-q", "-m", `delete ${key}`]).catch(() => {});
	}

	async list(prefix = ""): Promise<string[]> {
		await this.ensure();
		const out = await this.git(["ls-files", prefix]);
		return out ? out.split("\n").filter(Boolean) : [];
	}

	async query(q: StoreQuery): Promise<StoreObject[]> {
		const keys = await this.list(q.prefix ?? "");
		const out: StoreObject[] = [];
		for (const key of keys) {
			const obj = await this.get(key);
			if (!obj) continue;
			if (q.filter && !matchesFilter(decodeJson(obj.data), q.filter)) continue;
			out.push(obj);
			if (q.limit && out.length >= q.limit) break;
		}
		return out;
	}
}
