import { useEffect, useRef, useState } from "hono/jsx";
import {
	Root,
	type RootProps,
	ToggleGroupStructure,
	type ToggleGroupStructureProps,
} from "../components/ui/toggle-group-primitive";

export interface ToggleGroupIslandProps
	extends RootProps,
		ToggleGroupStructureProps {}

export default function ToggleGroupIsland(props: ToggleGroupIslandProps) {
	const {
		value: valueProp,
		defaultValue,
		onValueChange,
		children,
		items,
		multiple,
		...rest
	} = props;
	const [value, setValue] = useState(valueProp ?? defaultValue ?? []);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (valueProp !== undefined) {
			setValue(valueProp);
		}
	}, [valueProp]);

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;

		const handleClick = (e: MouseEvent) => {
			const item = (e.target as HTMLElement).closest<HTMLElement>(
				'[data-part="item"]',
			);
			if (item && !item.hasAttribute("disabled")) {
				const itemValue = item.getAttribute("data-value");
				if (!itemValue) return;
				let newValue: string[];

				if (multiple) {
					newValue = value.includes(itemValue)
						? value.filter((v) => v !== itemValue)
						: [...value, itemValue];
				} else {
					newValue = value.includes(itemValue) ? [] : [itemValue];
				}

				setValue(newValue);
				onValueChange?.(newValue);
			}
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			const item = (e.target as HTMLElement).closest<HTMLElement>(
				'[data-part="item"]',
			);
			if (!item) return;

			const items = Array.from(
				root.querySelectorAll<HTMLElement>(
					'[data-part="item"]:not([disabled])',
				),
			);
			const index = items.indexOf(item);

			let nextIndex = -1;
			if (e.key === "ArrowRight" || e.key === "ArrowDown") {
				nextIndex = (index + 1) % items.length;
			} else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
				nextIndex = (index - 1 + items.length) % items.length;
			} else if (e.key === "Home") {
				nextIndex = 0;
			} else if (e.key === "End") {
				nextIndex = items.length - 1;
			}

			if (nextIndex !== -1) {
				items[nextIndex].focus();
				e.preventDefault();
			}
		};

		root.addEventListener("click", handleClick);
		root.addEventListener("keydown", handleKeyDown);

		return () => {
			root.removeEventListener("click", handleClick);
			root.removeEventListener("keydown", handleKeyDown);
		};
	}, [value, onValueChange, multiple]);

	return (
		<Root
			{...rest}
			multiple={multiple}
			value={value}
			onValueChange={setValue}
			rootRef={rootRef}
			data-hydrated="true"
		>
			{children || <ToggleGroupStructure items={items} />}
		</Root>
	);
}
// island
