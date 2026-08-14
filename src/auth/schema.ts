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
	refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
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

/** The full schema object the drizzle adapter maps Better Auth models onto. */
export const authSchema = { user, session, account, verification };

export type AuthSchema = typeof authSchema;
