import { describe, expect, it } from "bun:test";
import { defaultIdentityMap } from "../storage/identity-map";
import { User } from "../models/user";
import { Board } from "../models/board";
import { Thread } from "../models/thread";

// ---------------------------------------------------------------------------
// Fixtures — a board with 5 threads at distinct updated_at values.
// ---------------------------------------------------------------------------
const uid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function seed(): { board: Board } {
	defaultIdentityMap.clear();
	User.from({
		id: uid,
		name: "Ada",
		email: "ada@example.com",
		role: "admin",
		age: 36,
		created_at: "2026-08-01T00:00:00.000Z",
	});
	const board = Board.from({
		id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		name: "General",
		slug: "general",
		description: "Talk",
		moderatorId: uid,
		created_at: "2026-08-01T00:00:00.000Z",
	});
	for (let i = 1; i <= 5; i++) {
		const d = `2026-08-0${i + 1}`;
		Thread.from({
			id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
			boardId: board.id,
			authorId: uid,
			title: `T${i}`,
			pinned: false,
			locked: false,
			created_at: `${d}T00:00:00.000Z`,
			updated_at: `${d}T00:00:00.000Z`,
		});
	}
	return { board };
}

describe("Siftable — cursor pagination", () => {
	it("desc (default): newest-first, one page at a time", () => {
		const { board } = seed();
		const collected: string[] = [];
		let cursor: string | null = null;
		let guard = 0;
		do {
			const page = Thread.sift(board.getThreads(), {}, { limit: 2, cursor });
			collected.push(...page.rows.map((t) => t.title));
			cursor = page.nextCursor;
			if (++guard > 10) break;
		} while (cursor);
		expect(collected).toEqual(["T5", "T4", "T3", "T2", "T1"]);
	});

	it("asc: oldest-first, one page at a time", () => {
		const { board } = seed();
		const collected: string[] = [];
		let cursor: string | null = null;
		let guard = 0;
		do {
			const page = Thread.sift(board.getThreads(), {}, {
				limit: 2,
				cursor,
				sort: { field: "updated_at", dir: "asc" },
			});
			collected.push(...page.rows.map((t) => t.title));
			cursor = page.nextCursor;
			if (++guard > 10) break;
		} while (cursor);
		expect(collected).toEqual(["T1", "T2", "T3", "T4", "T5"]);
	});

	it("null nextCursor on the final page", () => {
		const { board } = seed();
		const page = Thread.sift(board.getThreads(), {}, { limit: 100 });
		expect(page.rows.length).toBe(5);
		expect(page.nextCursor).toBeNull();
	});

	it("limit bounds the page size", () => {
		const { board } = seed();
		const page = Thread.sift(board.getThreads(), {}, { limit: 3 });
		expect(page.rows.length).toBe(3);
		expect(page.nextCursor).not.toBeNull();
	});

	it("combines with Queriable filtering", () => {
		const { board } = seed();
		// Filter to pinned=false then page. All are unpinned, so all 5 come back.
		const page = Thread.sift(board.getThreads(), { pinned: "false" }, { limit: 10 });
		expect(page.rows.length).toBe(5);
	});
});
