import {
	InteractiveSplitter,
	type InteractiveSplitterProps,
} from "../components/ui/splitter-primitive";

export default function SplitterIsland(props: InteractiveSplitterProps) {
	return <InteractiveSplitter {...props} />;
}

export type { InteractiveSplitterProps as SplitterIslandProps };
