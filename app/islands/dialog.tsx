import {
	InteractiveDialog,
	type InteractiveDialogProps,
} from "../components/ui/dialog-primitive";

export default function DialogIsland(props: InteractiveDialogProps) {
	return <InteractiveDialog {...props} />;
}

export type { InteractiveDialogProps as DialogIslandProps };
