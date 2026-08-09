import { type tags } from "typia";

/**
 * Blake3 — FORMAT-ONLY custom tag (the practical stand-in for
 * `tags.Format<"blake3">`).
 *
 * Validates that a string is the canonical lowercase-HEX encoding of a 32-byte
 * (256-bit) BLAKE3 digest: exactly 64 `[a-f0-9]` characters. This is a PURELY
 * SYNTACTIC check — it confirms the string *looks like* a BLAKE3 hash. It does
 * NOT verify that the hash actually equals `blake3(content)`; that SEMANTIC
 * correctness is the job of the runtime helpers in the `ContentAddressable`
 * capacity (`createAssertHash` at construction, `updateHash` on update) and the
 * `verifyContentAddress` integrity check — NOT of any typia tag.
 *
 * WHY WE DO NOT USE `tags.Format<"blake3">`: typia's built-in `Format` is a
 * closed allow-list (date-time, uuid, email, uri, …) and SILENTLY IGNORES
 * unknown formats, so a real custom tag via `tags.TagBase` is required. Use as
 * `string & Blake3`.
 *
 * WHY WE DO NOT USE AN OBJECT TAG FOR THE SEMANTIC CHECK: a field tag only sees
 * its own value, so it cannot recompute the hash from a sibling content field;
 * an object-scoped tag that *could* read the sibling was rejected because
 * content is immutable — the hash must be RE-DERIVED on every content set by
 * the model's constructor/update, not merely validated once. Hence the
 * function-based approach in `content-addressable.ts`.
 */
export type Blake3 = tags.TagBase<{
	kind: "blake3";
	target: "string";
	value: undefined;
	validate: `$input.length === 64 && /^[a-f0-9]{64}$/.test($input)`;
}>;
