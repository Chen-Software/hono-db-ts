import TabsIsland from "../../islands/tabs";
import { shouldHydrate } from "./island-utils";
import {
	Content,
	Context,
	Indicator,
	List,
	Root,
	type RootProps,
	Trigger,
} from "./tabs-primitive";

export interface TabsProps extends RootProps {
	interactive?: boolean;
}

const TabsRoot = (props: TabsProps) => {
	const { interactive, ...rest } = props;

	const hasSignal =
		rest.value !== undefined ||
		rest.defaultValue !== undefined ||
		rest.onValueChange !== undefined;

	if (shouldHydrate(interactive, hasSignal)) {
		return <TabsIsland {...(rest as unknown as Record<string, unknown>)} />;
	}

	return <Root {...rest}>{props.children}</Root>;
};

export const Tabs = Object.assign(TabsRoot, {
	Root: TabsRoot,
	List,
	Trigger,
	Content,
	Indicator,
	Context,
});

export type { TabsProps };
export default Tabs;
