import SearchIsland from "../../islands/search";
import { shouldHydrate } from "./island-utils";
import { SearchBase, type SearchBaseProps } from "./search-primitive";

export interface SearchProps extends SearchBaseProps {
	interactive?: boolean;
}

// Search is auto-interactive (Tier-1): autocomplete and instant filtering
// need JS, so it hydrates unless explicitly opted out — in which case it
// degrades to a plain GET form answered by the server (or ignored on SSG).
export function Search(props: SearchProps) {
	const { interactive, ...rest } = props;
	if (shouldHydrate(interactive, true)) {
		return <SearchIsland {...rest} />;
	}
	return <SearchBase {...rest} />;
}

export default Search;
