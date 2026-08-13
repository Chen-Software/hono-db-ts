import { describe, expect, it } from "bun:test";
import { defaultIdentityMap } from "../storage/identity-map";
import { User } from "./user";
import { Board } from "./board";
import { Thread, InvalidThreadStateError } from "./thread";
import { Reply } from "./reply";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const uid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const tid = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const rid = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function seed() {
	defaultIdentityMap.clear();
	const user = User.from({
		id: uid,
		name: "Ada",
		email: "ada@example.com",
		role: "admin",
		age: 36,
		created_at: "2026-08-01T00:00:00.000Z",
	});
	const board = Board.from({
		id: bid,
		name: "General",
		slug: "general",
		description: "Talk",
		moderatorId: uid,
		created_at: "2026-08-01T00:00:00.000Z",
	});
	const thread = Thread.from({
		id: tid,
		boardId: bid,
		authorId: uid,
		title: "First",
		pinned: false,
		locked: false,
		created_at: "2026-08-02T00:00:00.000Z",
		updated_at: "2026-08-02T00:00:00.000Z",
	});
	const reply = Reply.from({
		id: rid,
		threadId: tid,
		authorId: uid,
		body: "hello",
		created_at: "2026-08-03T00:00:00.000Z",
	});
	return { user, board, thread, reply };
}

describe("Board", () => {
	it("registers and validates a valid board", () => {
		const { board } = seed();
		expect(Board.is(board)).toBe(true);
		expect(Board.is({ ...board, slug: "Not Slug!" })).toBe(false);
	});

	it("derives getModerator() from the Reference tag (owner side)", () => {
		const { board } = seed();
		expect(board.getModerator()?.name).toBe("Ada");
	});

	it("getThreads() scans the identity map (inverse relation)", () => {
		const { board } = seed();
		expect(board.getThreads().length).toBe(1);
		expect(board.getThreads()[0].title).toBe("First");
	});
});

describe("Thread", () => {
	it("derives getBoard() and getAuthor() from FK tags", () => {
		const { thread, board } = seed();
		expect(thread.getBoard()?.id).toBe(board.id);
		expect(thread.getAuthor()?.name).toBe("Ada");
	});

	it("getReplies() returns replies for this thread", () => {
		const { thread, reply } = seed();
		expect(thread.getReplies().length).toBe(1);
		expect(thread.getReplies()[0].id).toBe(reply.id);
	});

	it("pin/unpin/lock/unlock mutate and guard invariants", () => {
		const { thread } = seed();
		const pinned = thread.pin();
		expect(pinned.pinned).toBe(true);
		expect(() => pinned.pin()).toThrow(InvalidThreadStateError);
		expect(pinned.unpin().pinned).toBe(false);

		const locked = pinned.lock();
		expect(locked.locked).toBe(true);
		expect(() => locked.lock()).toThrow(InvalidThreadStateError);
		expect(locked.unlock().locked).toBe(false);
	});

	it("touch() bumps updated_at (last-activity)", () => {
		const { thread } = seed();
		const touched = thread.touch();
		expect(touched.updated_at >= thread.updated_at).toBe(true);
	});
});

describe("Reply", () => {
	it("derives getThread() and getAuthor() from FK tags", () => {
		const { reply, thread } = seed();
		expect(reply.getThread()?.id).toBe(thread.id);
		expect(reply.getAuthor()?.name).toBe("Ada");
	});

	it("self-reference: parentId is optional; getParent() returns undefined for top-level", () => {
		const { reply } = seed();
		expect(reply.parentId).toBeUndefined();
		expect(reply.getParent()).toBeUndefined();
	});

	it("nested replies: getParent() + getChildren() walk the tree", () => {
		const { thread } = seed();
		const child = Reply.from({
			id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
			threadId: tid,
			authorId: uid,
			parentId: rid,
			body: "nested",
			created_at: "2026-08-04T00:00:00.000Z",
		});
		expect(child.getParent()?.id).toBe(rid);
		// Top-level replies = only those without a parentId.
		const top = thread.getReplies().filter((r) => r.parentId == null);
		expect(top.map((r) => r.id)).toEqual([rid]);
		// getChildren() on the parent returns the nested reply.
		const parent = child.getParent();
		expect(parent?.getChildren().map((r) => r.id)).toEqual([child.id]);
	});
});
