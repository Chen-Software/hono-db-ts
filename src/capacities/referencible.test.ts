import { describe, expect, it } from "bun:test";
import { Repository } from "../models/repository";
import { Referencible } from "../capacities/referencible";
import { User } from "../models/user";
import { hasModel } from "../registry";
import { defaultIdentityMap } from "../storage/identity-map";

/**
 * `Referencible` should consume the `Reference` tag on `ownerId` to derive the
 * owner-side accessor (`repository.getOwner()`) — no manual `relations` entry
 * needed. Unlike the old `Post`/`authorId` (`inner` join, throw-on-missing),
 * `Repository` uses a `left` join with `setNull`, so `getOwner()` returns
 * `undefined` (not a throw) when the owner is not registered.
 */

const ownerData = {
	id: "11111111-1111-4111-8111-111111111111",
	name: "Ada",
	email: "ada@example.com",
	role: "admin" as const,
	age: 36,
	created_at: "2026-08-09T12:00:00.000Z",
};

function makeRepo(id: string, ownerId: string) {
	return Repository.from({
		id,
		ownerId,
		name: `repo-${id.slice(0, 8)}`,
		lowerName: `repo-${id.slice(0, 8)}`,
		description: "a repository",
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
		created_at: "2026-08-09T12:00:00.000Z",
		updated_at: "2026-08-09T12:00:00.000Z",
	});
}

describe("Referencible derives the owner accessor from the Reference tag", () => {
	it("exposes getOwner() on Repository (derived from the tag, not declared manually)", () => {
		// The accessor is generated on the prototype from the `Reference` tag.
		expect(typeof (Repository.prototype as any).getOwner).toBe("function");
	});

	it("getOwner() resolves the FK ownerId to the live User via the identity map", () => {
		defaultIdentityMap.clear();
		const user = User.from({ ...ownerData });
		const repo = makeRepo("22222222-2222-4222-8222-222222222222", ownerData.id);

		// left join (per the tag's `join: "left"`) → returns the user, or null.
		expect(repo.getOwner()).toBe(user);
	});

	it("getOwner() returns undefined on left join when no matching User is registered", () => {
		defaultIdentityMap.clear();
		const repo = makeRepo(
			"33333333-3333-4333-8333-333333333333",
			"44444444-4444-4444-8444-444444444444",
		);
		// `Repository.ownerId` is a `left` join with `setNull` (per the Reference
		// tag), so the derived `getOwner()` returns `undefined` (not `null`, not
		// a throw) when no matching `User` is registered in the identity map.
		expect(repo.getOwner()).toBeUndefined();
	});
});

describe("Referencible drift guard", () => {
	it("wires the guard so the tag-derived accessor is present on the model", () => {
		// We can't flip Repository's tag at runtime, but we can assert the guard
		// wiring is live: constructing Repository/User succeeded with consistent
		// metadata (tag → getOwner). If they had drifted, defineModel would have
		// thrown at module load. This is a smoke check.
		expect(typeof (Repository.prototype as any).getOwner).toBe("function");
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
		const user = User.from({ ...ownerData });
		const repo = makeRepo(
			"55555555-5555-4555-8555-555555555555",
			ownerData.id,
		);
		expect(repo.getOwner()).toBe(user);
	});
});
