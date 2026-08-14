import CardIsland from "../../islands/card";
import { CardBase, type CardBaseProps } from "./card-primitive";
import { shouldHydrate } from "./island-utils";

export interface CardProps extends CardBaseProps {
	interactive?: boolean;
}

export function Card(props: CardProps) {
	const { interactive, ...rest } = props;
	const hasSignal =
		(props as Record<string, unknown>).onClick !== undefined ||
		(props as Record<string, unknown>).onPointerDown !== undefined;
	if (shouldHydrate(interactive, hasSignal)) {
		return <CardIsland {...rest} />;
	}
	return <CardBase {...rest} />;
}

export default Card;
