import { describe, expect, it } from "bun:test";
import { defaultIdentityMap } from "../storage/identity-map";
import { Repository } from "../models/repository";

// ---------------------------------------------------------------------------
// Fixtures — 5 repositories at distinct updated_at values.
// ---------------------------------------------------------------------------
function seed(): Repository[] {
	defaultIdentityMap.clear();
	const repos: any[] = [];
	for (let i = 1; i <= 5; i++) {
		const d = `2026-08-0${i + 1}`;
		repos.push(
			Repository.from({
				id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
				ownerId: null,
				name: `repo-${i}`,
				lowerName: `repo-${i}`,
				description: "",
				defaultBranch: "main",
				website: "",
				isPrivate: false,
				isArchived: false,
				isMirror: false,
				isTemplate: false,
				objectFormatName: "sha1",
				topics: [],
				numStars: 0,
				numForks: 0,
				numOpenIssues: 0,
				numClosedIssues: 0,
				size: 0,
				avatar: "",
				status: 0,
				created_at: `${d}T00:00:00.000Z`,
				updated_at: `${d}T00:00:00.000Z`,
			}),
		);
	}
	return repos;
}

describe("Siftable — cursor pagination", () => {
	it("desc (default): newest-first, one page at a time", () => {
		const repos = seed();
		const collected: string[] = [];
		let cursor: string | null = null;
		let guard = 0;
		do {
			const page = Repository.sift(repos, {}, { limit: 2, cursor });
			collected.push(...page.rows.map((r: any) => r.name));
			cursor = page.nextCursor;
			if (++guard > 10) break;
		} while (cursor);
		expect(collected).toEqual(["repo-5", "repo-4", "repo-3", "repo-2", "repo-1"]);
	});

	it("asc: oldest-first, one page at a time", () => {
		const repos = seed();
		const collected: string[] = [];
		let cursor: string | null = null;
		let guard = 0;
		do {
			const page = Repository.sift(repos, {}, {
				limit: 2,
				cursor,
				sort: { field: "created_at", dir: "asc" },
			});
			collected.push(...page.rows.map((r: any) => r.name));
			cursor = page.nextCursor;
			if (++guard > 10) break;
		} while (cursor);
		expect(collected).toEqual(["repo-1", "repo-2", "repo-3", "repo-4", "repo-5"]);
	});

	it("null nextCursor on the final page", () => {
		const repos = seed();
		const page = Repository.sift(repos, {}, { limit: 100 });
		expect(page.rows.length).toBe(5);
		expect(page.nextCursor).toBeNull();
	});

	it("limit bounds the page size", () => {
		const repos = seed();
		const page = Repository.sift(repos, {}, { limit: 3 });
		expect(page.rows.length).toBe(3);
		expect(page.nextCursor).not.toBeNull();
	});

	it("combines with Queriable filtering", () => {
		const repos = seed();
		// Filter to isPrivate=false then page. All are public, so all 5 come back.
		const page = Repository.sift(repos, { isPrivate: "false" }, { limit: 10 });
		expect(page.rows.length).toBe(5);
	});
});
