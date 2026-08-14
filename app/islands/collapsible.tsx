import {
	InteractiveRoot,
	type InteractiveRootProps,
} from "../components/ui/collapsible-primitive";

export default function CollapsibleIsland(props: InteractiveRootProps) {
	return <InteractiveRoot {...props} />;
}

export type { InteractiveRootProps as CollapsibleIslandProps };
