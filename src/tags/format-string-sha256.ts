import { type tags } from "typia";

/**
 * Sha256 — a custom typia type-tag for the canonical lowercase-HEX encoding of
 * a 32-byte (256-bit) SHA-256 digest.
 *
 * WHY A CUSTOM TAG (and not `tags.Format<"sha256">`):
 * `tags.Format<T>` is a CLOSED set. typia only generates validators for a fixed
 * allow-list of formats (date-time, uuid, email, uri, hostname, ipv4, ipv6, …).
 * Any *unknown* format string — including "sha256" — is SILENTLY IGNORED:
 * `string & tags.Format<"sha256">` compiles, but the runtime check is a no-op
 * that happily accepts `"not-a-hash!!!"` as valid. There is no public
 * extension point to teach `tags.Format` a new format (its validation is
 * hardcoded in typia's transformer, not data-driven), so a custom tag via
 * `tags.TagBase` is the only way to get REAL validation. Use it as
 * `string & Sha256` — functionally identical ergonomically to what
 * `Format<"sha256">` *would* be, but actually enforced.
 *
 * The `validate` string is emitted verbatim by typia's transformer into the
 * generated runtime checker; `$input` is substituted with the value under
 * test. SHA-256's output is 32 bytes → 64 lowercase hex characters.
 */
export type Sha256 = tags.TagBase<{
	kind: "sha256";
	target: "string";
	value: undefined;
	validate: `$input.length === 64 && /^[a-f0-9]{64}$/.test($input)`;
}>;
