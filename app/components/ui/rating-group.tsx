import RatingGroupIsland from "../../islands/rating-group";
import { shouldHydrate } from "./island-utils";
import {
	Control,
	Item,
	ItemIndicator,
	Label,
	Root,
	type RootProps,
} from "./rating-group-primitive";

export interface RatingGroupProps extends RootProps {
	interactive?: boolean;
}

const RatingGroupRoot = (props: RatingGroupProps) => {
	const { interactive, ...rest } = props;

	const hasSignal =
		rest.value !== undefined ||
		rest.defaultValue !== undefined ||
		rest.onValueChange !== undefined ||
		rest.onHoveredValueChange !== undefined;
	const Component = shouldHydrate(interactive, hasSignal)
		? RatingGroupIsland
		: Root;

	return <Component {...rest} />;
};

const RatingGroup = Object.assign(RatingGroupRoot, {
	Root: Root,
	Label: Label,
	Control: Control,
	Item: Item,
	ItemIndicator: ItemIndicator,
});

export { RatingGroup };
