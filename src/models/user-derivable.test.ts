import { describe, expect, it } from "bun:test";
import { defaultIdentityMap } from "../storage/identity-map";
import { User } from "./user";

function freshUser(over: Record<string, unknown> = {}) {
	defaultIdentityMap.clear();
	return User.from({
		id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		name: "Ada",
		email: "ada@example.com",
		role: "admin" as const,
		age: 36,
		created_at: "2026-08-01T00:00:00.000Z",
		...over,
	});
}

describe("User.all_activities (Derivable example)", () => {
	it("computes all_activities = post_count + thread_count + reply_count on construct", () => {
		const u = freshUser({ post_count: 5, thread_count: 3, reply_count: 12 });
		expect(u.all_activities).toBe(20);
	});

	it("defaults missing counters to 0 (all_activities = 0 when no counters given)", () => {
		const u = freshUser();
		expect(u.post_count).toBeUndefined();
		expect(u.all_activities).toBe(0);
	});

	it("re-derives when reconstructed from new counter values (Immutable path)", () => {
		// `User` is `Immutable`, so editing a counter does NOT auto-recompute
		// (the `onUpdate` hook never receives a patch). The working pattern is
		// to reconstruct — `Derivable` recomputes at construct time:
		const before = freshUser({ post_count: 2, thread_count: 2, reply_count: 2 });
		expect(before.all_activities).toBe(6);

		const after = freshUser({ post_count: 10, thread_count: 2, reply_count: 2 });
		expect(after.all_activities).toBe(14);
	});

	it("supports the 'most attentive user' comparison (sortable derived field)", () => {
		const quiet = freshUser({ post_count: 1, thread_count: 0, reply_count: 1 });
		const loud = freshUser({ post_count: 9, thread_count: 4, reply_count: 20 });
		expect(loud.all_activities).toBeGreaterThan(quiet.all_activities!);
	});
});
