import { TableBase, type TableProps } from "../components/ui/table-primitive";

// Wires row `onclick` handlers (table-primitive gates them on `interactive`).
// Sorting is handled separately by TableSortIsland — it can't live here:
// this component itself is hydrated from serialised props, which silently
// drop any function (see TableSortIsland's comment for the full reason), and
// a sortable column's `render`/`sortValue` are exactly that.
export default function TableIsland<T = Record<string, unknown>>(
	props: TableProps<T>,
) {
	return <TableBase {...props} />;
}
