import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/db/schema/postgres.ts",
	out: "./drizzle/postgres",
	// Connection URL comes from `DATABASE_URL` (prod `.env`) or the dev env.
	dbCredentials: {
		url:
			process.env["DATABASE_URL"] ?? process.env["DATABASE_URL_UNPOOLED"] ?? "",
	},
});
