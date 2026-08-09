import typia, { type tags } from "typia";

/**
 * Comparable is a capability that defines
 * how to compare two objects of the same type.
 * @alis Sortable
 * @template T - The type of the objects to
 * compare.
 */
interface Comparable<T> {
	equals(x: T, y: T): boolean;
	less(x: T, y: T): boolean;
	more(x: T, y: T): boolean;
}

export { type Comparable };
