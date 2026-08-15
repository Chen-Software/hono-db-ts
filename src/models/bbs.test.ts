import { describe, expect, it } from "bun:test";
import { defaultIdentityMap } from "../storage/identity-map";
import { User } from "./user";
import { Board } from "./board";
import { Thread, InvalidThreadStateError } from "./thread";
import { Reply } from "./reply";
import { Post } from "./post";

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

describe("User inverse accessors (auto-wired from Reference tags)", () => {
	it("derives getPosts/getThreads/getReplies/getBoards from source tags", () => {
		// No manual `relations` entry on User — these are wired by
		// `wireInverseRelations()` (run from `defineModel`) from the `Reference`
		// tags on Post/Thread/Reply/Board, each targeting "UserSchema".
		expect(typeof (User.prototype as any).getPosts).toBe("function");
		expect(typeof (User.prototype as any).getThreads).toBe("function");
		expect(typeof (User.prototype as any).getReplies).toBe("function");
		expect(typeof (User.prototype as any).getBoards).toBe("function");
	});

	it("inverse accessors scan the identity map for the user's own rows", () => {
		// `Post` is imported (and referenced below) so it registers and its
		// `authorId -> User` tag wires `user.getPosts()` automatically.
		expect(typeof Post).toBe("function");
		const { user, board, thread, reply } = seed();
		expect(user.getThreads().map((t: any) => t.id)).toEqual([thread.id]);
		expect(user.getReplies().map((r: any) => r.id)).toEqual([reply.id]);
		expect(user.getBoards().map((b: any) => b.id)).toEqual([board.id]);
		// No Post is seeded in this fixture, so getPosts() is the empty set.
		expect(user.getPosts()).toEqual([]);
	});
});

describe("Bidirectional consistency of auto-wired relations (owner + inverse)", () => {
	it("owner accessors and auto-wired inverse accessors agree in both directions", () => {
		// `Post` is imported + referenced so it registers and its `authorId ->
		// UserSchema` tag wires `user.getPosts()` automatically.
		expect(typeof Post).toBe("function");
		const { user, board, thread, reply } = seed();

		// --- OWNER side: derived from each model's OWN `Reference` tag ---
		expect(board.getModerator()).toBe(user); // Board.moderatorId -> UserSchema
		expect(thread.getBoard()).toBe(board); // Thread.boardId   -> BoardSchema
		expect(thread.getAuthor()).toBe(user); // Thread.authorId  -> UserSchema
		expect(reply.getThread()).toBe(thread); // Reply.threadId   -> ThreadSchema
		expect(reply.getAuthor()).toBe(user); // Reply.authorId   -> UserSchema

		// --- INVERSE side: auto-wired onto the TARGET from the SOURCE tag ---
		expect(user.getBoards()).toEqual([board]); // from Board.moderatorId
		expect(user.getThreads()).toEqual([thread]); // from Thread.authorId
		expect(user.getReplies()).toEqual([reply]); // from Reply.authorId
		expect(user.getPosts()).toEqual([]); // from Post.authorId (no Post seeded)

		// --- round-trip: target -> inverse -> owner returns the SAME instance ---
		expect(user.getBoards()[0].getModerator()).toBe(user);
		expect(user.getThreads()[0].getAuthor()).toBe(user);
		expect(user.getReplies()[0].getAuthor()).toBe(user);
		// Manual inverses close the same loop (no behaviour difference):
		expect(board.getThreads()[0].getBoard()).toBe(board);
		expect(thread.getReplies()[0].getThread()).toBe(thread);
	});

	it("inverse getters return arrays of reference-equal registered instances", () => {
		expect(typeof Post).toBe("function");
		const { user, thread } = seed();
		expect(Array.isArray(user.getThreads())).toBe(true);
		// identity-map backed: the returned instance IS the constructed one
		expect(user.getThreads()[0]).toBe(thread);
		// and navigating back resolves to the same user
		expect(user.getThreads()[0].getAuthor()).toBe(user);
		// an empty inverse is a real (empty) array, not undefined
		expect(user.getPosts()).toEqual([]);
	});
});

describe("Auto-wired onDelete mirrors the Reference tag (registration)", () => {
	it("registers one in-memory onDelete hook per tagged FK targeting User", () => {
		// Post/Thread/Reply target "UserSchema" with `cascade`; Board targets it
		// with `setNull`. `wireInverseRelations()` must therefore install 4
		// onDelete hooks on User (3 cascade + 1 setNull), mirroring each tag.
		// The hooks are now FIRED by `ModelBase.delete()` (see base.ts) — the
		// "In-memory delete() fires onDelete" block below verifies their
		// execution (cascade removes Posts/Threads/Replies; setNull nulls
		// Boards). This block asserts the wiring (4 hooks on User: 3 cascade +
		// 1 setNull).
		const hooks = (User as any).hooks?.onDelete ?? [];
		expect(Array.isArray(hooks)).toBe(true);
		expect(hooks.length).toBe(4);
	});
});

describe("In-memory delete() fires onDelete (cascade / setNull)", () => {
	it("user.delete() cascades Posts/Threads/Replies out of the identity map", () => {
		// `Post` is imported + referenced so it registers and its `authorId ->
		// UserSchema` tag wires `user.getPosts()` automatically.
		expect(typeof Post).toBe("function");
		const { user, thread, reply } = seed();
		// Seed a Post authored by the same user (cascade source).
		const post = Post.from({
			id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
			title: "Hi",
			body: "body",
			author: user,
			authorId: uid,
			published: false,
			created_at: "2026-08-09T12:00:00.000Z",
			updated_at: "2026-08-09T12:00:00.000Z",
			contentHash: "a".repeat(64),
		});

		// Sanity: all children are registered before the delete.
		expect(user.getPosts().map((p: any) => p.id)).toEqual([post.id]);
		expect(user.getThreads().map((t: any) => t.id)).toEqual([thread.id]);
		expect(user.getReplies().map((r: any) => r.id)).toEqual([reply.id]);

		user.delete();

		// Cascade removed each child from the identity map.
		expect(defaultIdentityMap.get("PostSchema", post.id)).toBeUndefined();
		expect(defaultIdentityMap.get("ThreadSchema", thread.id)).toBeUndefined();
		expect(defaultIdentityMap.get("ReplySchema", reply.id)).toBeUndefined();
		// And the user itself is deregistered.
		expect(defaultIdentityMap.get("UserSchema", uid)).toBeUndefined();
		// Navigation from the (now-deregistered but still in-scope) user object
		// finds nothing.
		expect(user.getPosts()).toEqual([]);
		expect(user.getThreads()).toEqual([]);
		expect(user.getReplies()).toEqual([]);
	});

	it("user.delete() setNulls Boards (reconstructs frozen Board with null FK)", () => {
		const { user, board } = seed();
		expect(board.moderatorId).toBe(uid);
		expect(user.getBoards().map((b: any) => b.id)).toEqual([board.id]);

		user.delete();

		// Board is NOT deleted (setNull, not cascade) — still in the map...
		const survivor = defaultIdentityMap.get("BoardSchema", board.id);
		expect(survivor).toBeDefined();
		// ...but its FK to the deleted user is nulled (reconstructed, frozen).
		expect((survivor as any).moderatorId).toBeNull();
		// Identity preserved (same id) — it is a NEW instance.
		expect((survivor as any).id).toBe(board.id);
		// And it no longer appears under the deleted user.
		expect(user.getBoards()).toEqual([]);
	});

	it("delete() is idempotent (safe to call twice)", () => {
		const { user, thread } = seed();
		user.delete();
		expect(() => user.delete()).not.toThrow();
		expect(defaultIdentityMap.get("ThreadSchema", thread.id)).toBeUndefined();
		expect(defaultIdentityMap.get("UserSchema", uid)).toBeUndefined();
	});
});
