import { cx } from "design-system/css";
import { search } from "design-system/recipes";
import { SearchIcon as SearchIconImport } from "../../icons/search";

const SearchIcon = (props: any) => (
	<SearchIconImport width="20" height="20" {...props} />
);

export const DEFAULT_PLACEHOLDERS: Record<string, string> = {
	en: "Search...",
	zh: "搜索...",
	es: "Buscar...",
	pt: "Buscar...",
	fr: "Rechercher...",
};

export const DEFAULT_ITEM_LABELS: Record<string, string> = {
	en: "results",
	zh: "结果",
	es: "resultados",
	pt: "resultados",
	fr: "résultats",
};

export interface SearchBaseProps {
	locale?: string;
	src?: string;
	placeholder?: string;
	initialQuery?: string;
	debounceMs?: number;
	maxSuggestions?: number;
	filterAttribute?: string;
	emptyStateId?: string;
	total?: number;
	itemLabel?: string;
	showCount?: boolean;
	action?: string;
	syncUrl?: boolean;
	variant?: "outline" | "surface" | "subtle";
	size?: "sm" | "md" | "lg";
	class?: string;
	style?: any;
}

/** Static (non-hydrated) variant: a plain GET form the server can answer. */
export function SearchBase(props: SearchBaseProps) {
	const [variantProps, localProps] = search.splitVariantProps(props);
	const {
		locale = "en",
		placeholder,
		initialQuery = "",
		action,
		class: classProp,
		style,
		...rest
	} = localProps;

	const styles = search(variantProps);
	const resolvedPlaceholder =
		placeholder ?? DEFAULT_PLACEHOLDERS[locale] ?? DEFAULT_PLACEHOLDERS.en;

	const input = (
		<div class={styles.inputWrap}>
			<div class={styles.icon}>
				<SearchIcon />
			</div>
			<input
				type="search"
				name="q"
				placeholder={resolvedPlaceholder}
				value={initialQuery}
				class={styles.input}
				{...rest}
			/>
		</div>
	);

	return action ? (
		<form
			action={action}
			method="get"
			class={cx(styles.root, classProp)}
			style={style}
		>
			{input}
		</form>
	) : (
		<div class={cx(styles.root, classProp)} style={style}>
			{input}
		</div>
	);
}
