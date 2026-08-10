import { Repository } from "./repository";
import { StoreProvider } from "../providers/store-provider";
import { BlobBackend } from "../providers/blob-backend";
import { SqlBackend, type DrizzleRunner } from "../providers/sql-backend";
import type { BlobStoreProvider } from "../providers/blob-store";
import type { UserRepository, UserRole } from "../ports/user-repository";
import type { Table } from "drizzle-orm";
import {
	User,
	UserSchemaModule,
	UserPgTable,
	userToRow,
	userFromRow,
	type UserSchema,
} from "../models/user";

/**
 * `UserRepo` — the concrete host for `User`.
 *
 * It binds two things the generic `Repository` cannot know:
 *   - the `User` model class (for rehydration), and
 *   - the `UserSchemaModule` (already bound inside `User`) — including its
 *     `sql` slice for the relational backend.
 *
 * The two `static` factories make the UNIFIED provider explicit — the user's
 * sketch (`new UserRepo(storageProvider)`) where `storageProvider` is itself
 * built from a backend + driver:
 *
 *   // local file (sqlite)
 *   UserRepo.overSql("users", drizzle(new Database("./app.db")), UserSqliteTable)
 *
 *   // remote (postgres)
 *   UserRepo.overSql("users", drizzle(postgres(DB_URL)), UserPgTable)
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

	/** Unified repo over any SQL backend (bun:sqlite local / postgres remote). */
	static overSql(namespace: string, db: DrizzleRunner, table: Table): UserRepo {
		return new UserRepo(
			new StoreProvider({
				schema: UserSchemaModule,
				namespace,
				backend: new SqlBackend(db, { table, toRow: userToRow, fromRow: userFromRow }),
			}),
		);
	}
}

// Re-export so callers can pass the right table without re-importing the model.
export { UserPgTable };
