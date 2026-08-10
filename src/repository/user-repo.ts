import { Repository } from "./repository";
import { StoreProvider } from "../providers/store-provider";
import { BlobBackend } from "../providers/blob-backend";
import { SqlBackend, type DrizzleRunner } from "../providers/sql-backend";
import type { BlobStoreProvider } from "../providers/blob-store";
import type { UserRepository, UserRole } from "../ports/user-repository";
import { User, UserSchemaModule, type UserSchema } from "../models/user";

/**
 * `UserRepo` — the concrete host for `User`.
 *
 * It binds two things the generic `Repository` cannot know:
 *   - the `User` model class (for rehydration), and
 *   - the `UserSchemaModule` (already bound inside `User`) — including its
 *     `sql` / `sqlPg` slices for the relational backend. These are DERIVED by
 *     the `SqlSerialisable` capacity from the reflected `UserSchema`, so the
 *     model contains no hand-written drizzle table or mappers.
 *
 * The two `static` factories make the UNIFIED provider explicit — the user's
 * sketch (`new UserRepo(storageProvider)`) where `storageProvider` is itself
 * built from a backend + driver:
 *
 *   // local file (sqlite) — uses the derived `sql` slice
 *   UserRepo.overSql("users", drizzle(new Database("./app.db")), "sqlite")
 *
 *   // remote (postgres) — uses the derived `sqlPg` slice
 *   UserRepo.overSql("users", drizzle(postgres(DB_URL)), "pg")
 *
 *   // object store / fs / db-as-blob
 *   UserRepo.overBlob("users", new ObjectStoreProvider(new LocalObjectStoreClient("./data")))
 *   UserRepo.overBlob("users", new FsProvider("./data"))
 *
 * Same `UserRepo`, same operations; only the backend adapter (and its driver)
 * changes. The repo owns the identity map + authorization for users; the
 * backend choice is just a constructor argument passed through `StoreProvider`.
 */
export class UserRepo
	extends Repository<UserSchema, User>
	implements UserRepository
{
	constructor(store: StoreProvider<UserSchema>) {
		super({ store, Model: User });
	}

	/** All users. */
	async list(): Promise<User[]> {
		return this.find();
	}

	/** Users with the given role (compiled to a real SQL WHERE by the SQL backend). */
	async listByRole(role: UserRole): Promise<User[]> {
		return this.find({ where: { role } });
	}

	/** Unified repo over any BLOB backend (object store / fs / db-as-blob). */
	static overBlob(namespace: string, backend: BlobStoreProvider): UserRepo {
		return new UserRepo(
			new StoreProvider({
				schema: UserSchemaModule,
				namespace,
				backend: new BlobBackend(backend, UserSchemaModule),
			}),
		);
	}

	/**
	 * Unified repo over any SQL backend (bun:sqlite local / postgres remote).
	 * `dialect` selects which DERIVED projection to use: `"sqlite"` reads
	 * `UserSchemaModule.sql`, `"pg"` reads `UserSchemaModule.sqlPg`. The table +
	 * row mappers come from the model's `SqlSerialisable` capacity — the caller
	 * never hand-writes a drizzle table.
	 */
	static overSql(
		namespace: string,
		db: DrizzleRunner,
		dialect: "sqlite" | "pg" = "sqlite",
	): UserRepo {
		const def =
			dialect === "pg" ? UserSchemaModule.sqlPg : UserSchemaModule.sql;
		if (!def) {
			throw new Error(
				`UserRepo.overSql: no \`sql\` projection for dialect "${dialect}" ` +
					`— declare the SqlSerialisable capacity on the User model ` +
					"(with `both: true` to derive both dialects).",
			);
		}
		return new UserRepo(
			new StoreProvider({
				schema: UserSchemaModule,
				namespace,
				backend: new SqlBackend(db, def),
			}),
		);
	}

	/**
	 * Unified repo over a D1 drizzle instance (local dev / Cloudflare D1).
	 *
	 * D1 uses the SQLite dialect, so this is a thin alias for `overSql` with
	 * `dialect: "sqlite"`.  The method exists as an explicit API so callers
	 * (smoke tests, CF Worker wiring) express the intent clearly.
	 *
	 *   // local dev (LocalD1Database over bun:sqlite)
	 *   UserRepo.overD1("users", drizzle(new LocalD1Database("./dev.sqlite")))
	 *
	 *   // production (Cloudflare Workers binding)
	 *   UserRepo.overD1("users", drizzle(env.DB))
	 */
	static overD1(namespace: string, d1Db: DrizzleRunner): UserRepo {
		return UserRepo.overSql(namespace, d1Db, "sqlite");
	}
}
