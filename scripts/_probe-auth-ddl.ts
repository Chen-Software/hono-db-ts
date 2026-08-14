import { account, session, user, verification } from "../src/auth/schema";

const NAME = Symbol.for("drizzle:Name");
const COLS = Symbol.for("drizzle:Columns");

for (const t of [user, session, account, verification]) {
	const name = t[NAME as unknown as keyof typeof t] as unknown as string;
	const cols = t[COLS as unknown as keyof typeof t] as unknown as Record<
		string,
		{
			name: string;
			primary: boolean;
			notNull: boolean;
			isUnique: boolean;
			getSQLType: () => string;
		}
	>;
	console.log(`== ${name}`);
	for (const c of Object.values(cols)) {
		console.log(
			`  ${c.name} ${c.getSQLType()} primary=${c.primary} notNull=${c.notNull} unique=${c.isUnique}`,
		);
	}
}
