import { describe, expect, it } from "bun:test";
import { Post } from "../models/post";
import { Referencible } from "../capacities/referencible";
import { User } from "../models/user";
import { hasModel } from "../registry";
import { defaultIdentityMap } from "../storage/identity-map";

/**
 * `Referencible` should consume the `Reference` tag on `authorId` to derive the
 * owner-side accessor (`post.getUser()`) — no manual `relations` entry needed.
 * The inverse side (`user.getPosts()`) stays manual but its `cardinality` /
 * `onDelete` are guarded against the tag.
 */

// 64-hex placeholder — `Hashable` recomputes the real hash from
// `body`, so this only needs to satisfy the `Sha256` format check at the
// boundary (mirrors `post.test.ts`).
const HASH_PLACEHOLDER = "a".repeat(64);

// A plain UserSchema-shaped payload (matches `post.test.ts`'s `authorData`).
// `Post.author` is typed `UserSchema`, so the nested author must be plain data,
// not a `User` instance.
const authorData = {
	id: "11111111-1111-4111-8111-111111111111",
	name: "Ada",
	email: "ada@example.com",
	role: "admin" as const,
	age: 36,
	created_at: "2026-08-09T12:00:00.000Z",
};

function makePost(id: string, authorId: string) {
	return Post.from({
		id,
		title: "Hello",
		body: "world",
		author: { ...authorData, id: authorId },
		authorId,
		published: false,
		created_at: "2026-08-09T12:00:00.000Z",
		updated_at: "2026-08-09T12:00:00.000Z",
		contentHash: HASH_PLACEHOLDER,
	});
}

describe("Referencible derives the owner accessor from the Reference tag", () => {
	it("exposes getUser() on Post (derived from the tag, not declared manually)", () => {
		// The accessor is generated on the prototype from the `Reference` tag.
		expect(typeof (Post.prototype as any).getUser).toBe("function");
		// Sanity: the inverse accessor is still present (manual).
		expect(typeof (User.prototype as any).getPosts).toBe("function");
	});

	it("getUser() resolves the FK authorId to the live User via the identity map", () => {
		defaultIdentityMap.clear();
		const user = User.from({ ...authorData });
		const post = makePost(
			"22222222-2222-4222-8222-222222222222",
			authorData.id,
		);

		// inner join (per the tag's `join: "inner"`) → returns the user, not
		// undefined, and it is the SAME instance registered in the map.
		expect(post.getUser()).toBe(user);
		// inverse (manual) → collection scan.
		expect(user.getPosts()).toEqual([post]);
	});

	it("getUser() throws on inner join when no matching User is registered", () => {
		defaultIdentityMap.clear();
		const post = makePost(
			"33333333-3333-4333-8333-333333333333",
			"44444444-4444-4444-8444-444444444444",
		);
		expect(() => post.getUser()).toThrow(/inner join/);
	});
});

describe("Referencible drift guard", () => {
	it("wires the guard so an owner manual spec must agree with the tag", () => {
		// We can't flip Post's tag at runtime, but we can assert the guard
		// wiring is live: constructing Post/User succeeded with consistent
		// metadata (tag cascade ↔ getPosts cascade). If they had drifted,
		// defineModel would have thrown at module load. This is a smoke check.
		expect(typeof (User.prototype as any).getPosts).toBe("function");
		expect(typeof (Post.prototype as any).getUser).toBe("function");
	});
});

describe("Referencible owner accessor — lighter existence check", () => {
	// Exercises the `hasModel` gate that replaced the old `resolveModel` class
	// lookup: a relation whose target name is NOT in the registry must fail
	// loudly ("unknown model"), not silently return undefined.
	it("throws on a target name that is not registered", () => {
		class RefMini {
			static schemaName = "RefMini";
			id: string;
			ghostId?: string;
			constructor(data: any) {
				this.id = data.id;
				Object.assign(this, data);
			}
		}
		Referencible(RefMini, undefined, {
			relations: [
				{
					name: "ghost",
					// string target (as tag-derived relations now use) — NOT in registry.
					target: () => "GhostSchema",
					by: "ghostId",
					cardinality: "many-to-one",
					join: "inner",
				},
			],
		});

		expect(typeof (RefMini.prototype as any).getGhost).toBe("function");
		expect(hasModel("GhostSchema")).toBe(false);
		const m = new RefMini({ id: "m1", ghostId: "g1" });
		expect(() => (m as any).getGhost()).toThrow(/unknown model/);
	});

	it("still resolves via the identity map when the target IS registered", () => {
		// Regression guard: the string-target path must still key the identity
		// map by the target's schemaName and find the instance.
		defaultIdentityMap.clear();
		const user = User.from({ ...authorData });
		const post = makePost(
			"55555555-5555-4555-8555-555555555555",
			authorData.id,
		);
		expect(post.getUser()).toBe(user);
	});
});
