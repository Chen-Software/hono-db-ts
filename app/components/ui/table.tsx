import TableIsland from "../../islands/table";
import TableSortIsland from "../../islands/table-sort";
import { shouldHydrate } from "./island-utils";
import {
	TableBase,
	type TableColumn,
	type TableProps,
	type TableRow,
} from "./table-primitive";

export function Table<T = Record<string, unknown>>(props: TableProps<T>) {
	const hasRowClick = (props.rows ?? []).some(
		(r) => (r as unknown as TableRow).onClick != null,
	);
	const hasSortableColumn = (props.columns ?? []).some(
		(column) => column.sortable,
	);

	if (shouldHydrate(props.interactive, hasRowClick)) {
		// `interactive` must be true on the island so TableBase wires row
		// `onclick` handlers (table-primitive gates them on this flag).
		return <TableIsland {...props} interactive={true} />;
	}

	if (hasSortableColumn) {
		// Wrap the table rather than hydrating it directly — see
		// TableSortIsland for why `columns[].render`/`sortValue` (functions)
		// can't survive going through an island as props.
		return (
			<TableSortIsland>
				<TableBase {...props} />
			</TableSortIsland>
		);
	}

	return <TableBase {...props} />;
}

export type { TableColumn, TableProps, TableRow };
