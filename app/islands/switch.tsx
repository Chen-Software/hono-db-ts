import { useState } from "hono/jsx";
import { Switch, type SwitchProps } from "../components/ui/switch-primitive";

export interface InteractiveSwitchProps extends SwitchProps {
	defaultChecked?: boolean;
}

export function InteractiveSwitch(props: InteractiveSwitchProps) {
	const {
		checked: checkedProp,
		defaultChecked,
		onCheckedChange,
		...rest
	} = props;

	const [isChecked, setIsChecked] = useState(checkedProp ?? !!defaultChecked);
	const isControlled = checkedProp !== undefined;
	const checked = isControlled ? checkedProp : isChecked;

	const handleCheckedChange = (details: { checked: boolean }) => {
		if (!isControlled) {
			setIsChecked(details.checked);
		}
		onCheckedChange?.(details);
	};

	return (
		<Switch {...rest} checked={checked} onCheckedChange={handleCheckedChange} />
	);
}

export default function SwitchIsland(props: InteractiveSwitchProps) {
	return <InteractiveSwitch {...props} />;
}

export type { InteractiveSwitchProps as SwitchIslandProps };
