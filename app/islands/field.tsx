import {
	type FieldProps,
	InteractiveField,
} from "../components/ui/field-primitive";

export default function FieldIsland(props: FieldProps) {
	return <InteractiveField {...props} />;
}

export type { FieldProps as FieldIslandProps };
