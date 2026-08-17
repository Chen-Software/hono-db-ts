-- Personal Access Tokens for the git transport (P0-1).
-- Only the SHA-256 of the raw token is stored; the raw token is returned once
-- at creation and never persisted or logged.

CREATE TABLE IF NOT EXISTS "access_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_sha256" text NOT NULL,
	"scopes" text NOT NULL DEFAULT '["read:repository","write:repository"]',
	"last_used_at" text,
	"expires_at" text,
	"created_at" text NOT NULL,
	FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "access_tokens_user_id_idx" ON "access_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "access_tokens_token_sha256_idx" ON "access_tokens" ("token_sha256");
