import type { tags } from "typia";

export interface IBbsArticle {
	id: string & tags.Format<"uuid">;
	title: string & tags.MinLength<3> & tags.MaxLength<100>;
	body: string;
	created_at: string & tags.Format<"date-time">;
}
