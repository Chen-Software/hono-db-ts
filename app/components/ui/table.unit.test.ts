import { describe, expect, test } from "bun:test";
import { TASK_PRIORITIES, TASK_STATUSES } from "../../lib/tasks";
import { Table } from "./table";

describe("Table Unit Tests", () => {
	test("Table component exists", () => {
		expect(Table).toBeDefined();
	});

	test("Table renders", () => {
		const columns = [
			{ header: "Name", key: "name" },
			{ header: "Age", key: "age" },
		];
		const rows = [
			{ name: "Alice", age: 30 },
			{ name: "Bob", age: 25 },
		];

		const table = Table({ columns, rows });
		expect(table).toBeDefined();
		expect(typeof table).toBe("object");
	});

	test("Priority maps to numeric values for sorting correctly", () => {
		const mockTasks = [
			{ priority: "Low" },
			{ priority: "Medium" },
			{ priority: "High" },
			{ priority: "Urgent" },
		];

		const prioritySortValues = mockTasks.map((t) =>
			TASK_PRIORITIES.indexOf(t.priority as any),
		);
		expect(prioritySortValues).toEqual([0, 1, 2, 3]);
	});

	test("Status maps to numeric values for sorting correctly", () => {
		const mockTasks = [
			{ status: "To Do" },
			{ status: "In Progress" },
			{ status: "In Review" },
			{ status: "Done" },
		];

		const statusSortValues = mockTasks.map((t) =>
			TASK_STATUSES.indexOf(t.status as any),
		);
		expect(statusSortValues).toEqual([0, 1, 2, 3]);
	});

	test("Table renders hoverActions as a trailing column", () => {
		const columns = [{ header: "Name", key: "name" }];
		const rows = [{ name: "Alice" }];

		const table = Table({
			columns,
			rows,
			hoverActions: (row: any) => row.name,
		});

		expect(table).toBeDefined();
	});

	test("Table with sortable columns hydrates as TableSortIsland", () => {
		const columns = [
			{
				header: "Status",
				key: "status",
				sortable: true,
				sortValue: (row: any) => TASK_STATUSES.indexOf(row.status),
			},
		];
		const rows = [{ status: "To Do" }];
		const table = Table({ columns, rows });

		expect(table).toBeDefined();
		// Since it has a sortable column and interactive is omitted, shouldHydrate returns true.
		// It should render TableSortIsland component.
		expect(table.tag).toBeDefined();
		expect(table.tag.name).toBe("TableSortIsland");
	});
});
