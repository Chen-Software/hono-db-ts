/**
 * auth/schema — Better Auth's database schema (SQLite dialect, drizzle).
 *
 * This is the ONE source of truth for the auth tables. It mirrors exactly what
 * `npx @better-auth/cli generate` emits for a SQLite database (the default
 * Better Auth model set: user / session / account / verification), written by
 * hand here so it can also be consumed as the `schema` object by the drizzle
 * adapter (`better-auth/adapters/drizzle`).
 *
 * The matching DDL lives in `drizzle/*_auth_sqlite_create.sql` (applied by
 * `db:migrate`, `serve`'s `ensureSchema`, the CF sqlite backend's inline
 * migrations, and `wrangler d1 migrations apply` for D1). Keep the two in sync.
 *
 * Timestamps are stored as unix seconds via drizzle's `{ mode: "timestamp" }`
 * integer columns — the same convention Better Auth's generated schema uses.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
	image: text("image"),
	// Added by the better-auth 2FA plugin: `false` until the user enables 2FA.
	// Nullable-with-default so an EXISTING `user` table can gain the column via
	// a plain `ALTER TABLE ... ADD COLUMN "twoFactorEnabled" integer DEFAULT 0`
	// (SQLite forbids NOT NULL ADD COLUMN without a default); better-auth fills
	// the JS-side default (`false`) on insert. `ensureAuthSchema` heals old DBs.
	twoFactorEnabled: integer("twoFactorEnabled", { mode: "boolean" }).default(false),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
	id: text("id").primaryKey(),
	expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
	token: text("token").notNull().unique(),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
	ipAddress: text("ipAddress"),
	userAgent: text("userAgent"),
	userId: text("userId")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
	id: text("id").primaryKey(),
	accountId: text("accountId").notNull(),
	providerId: text("providerId").notNull(),
	userId: text("userId")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("accessToken"),
	refreshToken: text("refreshToken"),
	idToken: text("idToken"),
	accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
	refreshTokenExpiresAt: integer("refreshTokenExpiresAt", {
		mode: "timestamp",
	}),
	scope: text("scope"),
	password: text("password"),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
	createdAt: integer("createdAt", { mode: "timestamp" }),
	updatedAt: integer("updatedAt", { mode: "timestamp" }),
});

/**
 * The better-auth 2FA plugin's TOTP store (one row per enrolled user).
 *
 * Mirrors the plugin's schema (`node_modules/better-auth/.../two-factor/schema`):
 * `secret` holds the TOTP base32 secret, `backupCodes` the (encrypted) backup
 * codes, `verified` whether the first TOTP check passed, plus lockout fields.
 * Rows only appear when a user actually enrolls — the git transport never reads
 * this table; it only checks `user.twoFactorEnabled` (see `src/git/auth.ts`).
 */
export const twoFactor = sqliteTable("twoFactor", {
	id: text("id").primaryKey(),
	secret: text("secret").notNull(),
	backupCodes: text("backupCodes").notNull(),
	userId: text("userId")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	verified: integer("verified", { mode: "boolean" }).notNull().default(true),
	failedVerificationCount: integer("failedVerificationCount").notNull().default(0),
	lockedUntil: integer("lockedUntil", { mode: "timestamp" }),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

/** The full schema object the drizzle adapter maps Better Auth models onto. */
export const authSchema = { user, session, account, verification, twoFactor };

export type AuthSchema = typeof authSchema;
