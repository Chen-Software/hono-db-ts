import { css } from "design-system/css";
import type { JSX } from "hono/jsx";
import HoverCardIsland from "../../islands/hover-card";
import {
	Arrow,
	ArrowTip,
	Content,
	Context,
	type HoverCardPlacement,
	type HoverCardRootProps,
	Positioner,
	Root as RootPrimitive,
	RootProvider,
	Trigger,
} from "./hover-card-primitive";
import { shouldHydrate } from "./island-utils";
import { Text } from "./text";

interface HoverCardProps extends HoverCardRootProps {
	interactive?: boolean; // keep — forces island hydration (default true)
	trigger?: JSX.Element; // rendered asChild inside HoverCardTrigger
	title?: string | JSX.Element; // convenience — rendered as bold Text
	description?: string | JSX.Element; // convenience — rendered as muted Text
	content?: JSX.Element; // full custom body; overrides title/description
}

function Root(props: HoverCardProps) {
	const { interactive, ...rest } = props;
	if (shouldHydrate(interactive, true)) return <HoverCardIsland {...rest} />;
	return <RootPrimitive {...rest} />;
}

function HoverCard(props: HoverCardProps) {
	const {
		interactive,
		trigger,
		title,
		description,
		content,
		placement,
		...rest
	} = props;

	const body = content ?? (
		<>
			{title && <Text fontWeight="bold">{title}</Text>}
			{description && (
				<Text size="sm" class={css({ color: "fg.muted", mt: "1" })}>
					{description}
				</Text>
			)}
		</>
	);

	return (
		<Root {...rest} placement={placement} interactive={interactive}>
			{trigger && <Trigger asChild>{trigger}</Trigger>}
			<Positioner placement={placement}>
				<Content placement={placement}>
					<Arrow placement={placement} />
					{body}
				</Content>
			</Positioner>
		</Root>
	);
}

const HoverCardComponent = Object.assign(HoverCard, {
	Root,
	RootProvider,
	Trigger,
	Positioner,
	Content,
	Arrow,
	ArrowTip,
	Context,
});

export {
	Arrow,
	ArrowTip,
	Content,
	Context,
	HoverCardComponent as HoverCard,
	type HoverCardPlacement,
	type HoverCardProps,
	Positioner,
	Root,
	RootProvider,
	Trigger,
};

export default HoverCardComponent;
