import {
	InteractiveSelect,
	type SelectFlattenedProps,
} from "../components/ui/select-primitive";

export default function SelectIsland(props: SelectFlattenedProps) {
	return <InteractiveSelect {...props} data-hydrated="true" />;
}
