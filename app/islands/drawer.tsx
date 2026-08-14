import {
	InteractiveDrawer,
	type InteractiveDrawerProps,
} from "../components/ui/drawer-primitive";

export default function DrawerIsland(props: InteractiveDrawerProps) {
	return <InteractiveDrawer {...props} />;
}

export type { InteractiveDrawerProps as DrawerIslandProps };
