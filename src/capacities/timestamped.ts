import type { tags } from "typia";

interface Timestamped {
	/** Timestamp of entity creation. */
	created_at: string & tags.Format<"date-time">;
}

export type { Timestamped };
