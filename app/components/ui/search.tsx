import SearchIsland from "../../islands/search";
import { shouldHydrate } from "./island-utils";
import {
	DEFAULT_PLACEHOLDERS,
	SearchBase,
	type SearchBaseProps,
} from "./search-primitive";

export interface SearchProps extends SearchBaseProps {
	interactive?: boolean;
}

// Search is auto-interactive (Tier-1): autocomplete and instant filtering
// need JS, so it hydrates unless explicitly opted out — in which case it
// degrades to a plain GET form answered by the server (or ignored on SSG).
//
// The placeholder is resolved here (not in the island) so both the hydrated
// island and the static form honor `locale` the same way.
export function Search(props: SearchProps) {
	const { interactive, locale, placeholder, initialQuery, ...rest } = props;
	if (shouldHydrate(interactive, true)) {
		const resolvedPlaceholder =
			placeholder ??
			DEFAULT_PLACEHOLDERS[locale ?? "en"] ??
			DEFAULT_PLACEHOLDERS.en;
		return (
			<SearchIsland placeholder={resolvedPlaceholder} initialQuery={initialQuery} />
		);
	}
	return (
		<SearchBase
			placeholder={placeholder}
			locale={locale}
			initialQuery={initialQuery}
			{...rest}
		/>
	);
}

export default Search;
