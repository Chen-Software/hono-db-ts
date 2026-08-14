import type { Child, PropsWithChildren } from "hono/jsx";
import PaginationIsland from "../../islands/pagination";
import { shouldHydrate } from "./island-utils";
import {
	Ellipsis,
	FirstTrigger,
	Item,
	LastTrigger,
	NextTrigger,
	PaginationItems,
	PrevTrigger,
	Root,
} from "./pagination-primitive";

export interface PaginationProps extends PropsWithChildren {
	count: number;
	pageSize?: number;
	defaultPageSize?: number;
	page?: number;
	defaultPage?: number;
	siblingCount?: number;
	boundaryCount?: number;
	type?: "button" | "link";
	getPageUrl?: (details: { page: number }) => string;
	onPageChange?: (details: { page: number; pageSize: number }) => void;
	interactive?: boolean;
	renderItem?: (page: {
		type: "page";
		value: number;
		selected: boolean;
	}) => Child;
	ellipsis?: Child;
	class?: string;
	id?: string;
	size?: "sm" | "md" | "lg";
}

function Pagination(props: PaginationProps) {
	const {
		count,
		pageSize,
		defaultPageSize,
		page,
		defaultPage,
		siblingCount,
		boundaryCount,
		type,
		getPageUrl,
		onPageChange,
		interactive,
		renderItem,
		ellipsis,
		children,
		class: classProp,
		...rest
	} = props;

	// A `type="link"` pagination that supplies `getPageUrl` is pure navigation —
	// each page is an anchor with an href, so it needs no client JS. Only an
	// explicit `onPageChange` handler (button-mode behaviour) forces hydration.
	const isLinkMode = type === "link" && getPageUrl !== undefined;

	const hasSignal =
		onPageChange !== undefined ||
		(!isLinkMode &&
			(page !== undefined ||
				defaultPage !== undefined ||
				pageSize !== undefined ||
				defaultPageSize !== undefined));
	const isInteractive = shouldHydrate(interactive, hasSignal);

	const rootProps = {
		count,
		pageSize,
		defaultPageSize,
		page,
		defaultPage,
		siblingCount,
		boundaryCount,
		type,
		getPageUrl,
		class: classProp,
		...rest,
	};

	const content = children || (
		<>
			<PrevTrigger />
			<PaginationItems render={renderItem} ellipsis={ellipsis} />
			<NextTrigger />
		</>
	);

	if (isInteractive) {
		return (
			<PaginationIsland {...rootProps} onPageChange={onPageChange}>
				{content}
			</PaginationIsland>
		);
	}

	return <Root {...rootProps}>{content}</Root>;
}

const PaginationComponent = Object.assign(Pagination, {
	Root,
	Item,
	Ellipsis,
	PrevTrigger,
	NextTrigger,
	FirstTrigger,
	LastTrigger,
	Items: PaginationItems,
});

export { PaginationComponent as Pagination };
export default PaginationComponent;
