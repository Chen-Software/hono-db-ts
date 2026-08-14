import { css } from "design-system/css";
import { visuallyHidden } from "design-system/patterns";

export interface DisplayValueProps<T> {
	/** The value to display */
	value?: T | null | undefined;
	/** Optional function to format the value before displaying */
	formatValue?: (value: NonNullable<T>) => string | null | undefined;
}

export function DisplayValue<T>(props: DisplayValueProps<T>) {
	const { value, formatValue } = props;

	const formattedValue = isNotEmpty(value)
		? (formatValue?.(value) ?? String(value))
		: null;

	if (formattedValue) {
		return formattedValue;
	}

	return (
		<>
			<span class={css({ color: "fg.subtle" })} aria-hidden="true">
				—
			</span>
			<span class={visuallyHidden()}>No value available</span>
		</>
	);
}

const isNotEmpty = <T,>(
	value: T | null | undefined,
): value is NonNullable<T> => {
	if (value == null) return false;
	if (typeof value === "string" || Array.isArray(value))
		return value.length > 0;
	return true;
};
