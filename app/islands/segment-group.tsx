import { useEffect, useRef, useState } from "hono/jsx";
import {
	Root,
	type RootProps,
	SegmentGroupStructure,
	type SegmentGroupStructureProps,
} from "../components/ui/segment-group-primitive";

export interface SegmentGroupIslandProps
	extends RootProps,
		SegmentGroupStructureProps {}

export default function SegmentGroupIsland(props: SegmentGroupIslandProps) {
	const {
		value: valueProp,
		defaultValue,
		onValueChange,
		children,
		items,
		...rest
	} = props;
	const [value, setValue] = useState(valueProp ?? defaultValue);
	const rootRef = useRef<HTMLDivElement>(null);
	const isFirstRenderRef = useRef(true);

	useEffect(() => {
		if (valueProp !== undefined) {
			setValue(valueProp);
		}
	}, [valueProp]);

	const updateIndicator = (
		activeItem: HTMLElement,
		enableTransition = true,
	) => {
		const root = rootRef.current;
		if (!root) return;

		const indicator = root.querySelector<HTMLElement>(
			'[data-part="indicator"]',
		);
		if (indicator) {
			if (enableTransition) {
				indicator.removeAttribute("data-transition");
			} else {
				indicator.setAttribute("data-transition", "false");
				requestAnimationFrame(() => {
					indicator.removeAttribute("data-transition");
				});
			}
		}

		// offsetLeft/Top/Width/Height are pure layout measurements: unlike
		// getBoundingClientRect(), they're unaffected by an in-progress CSS
		// `transform` on an ancestor (e.g. a Popover/Dialog's scale-fade-in
		// open animation), so a ResizeObserver firing mid-animation can't
		// bake in a scaled-down snapshot.
		root.style.setProperty("--width", `${activeItem.offsetWidth}px`);
		root.style.setProperty("--height", `${activeItem.offsetHeight}px`);
		root.style.setProperty("--left", `${activeItem.offsetLeft}px`);
		root.style.setProperty("--top", `${activeItem.offsetTop}px`);
	};

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;

		const activeItem = root.querySelector<HTMLElement>(
			`[data-part="item"][data-value="${value}"]`,
		);

		if (activeItem) {
			const enableTransition = !isFirstRenderRef.current;
			if (isFirstRenderRef.current) {
				isFirstRenderRef.current = false;
			}
			requestAnimationFrame(() => {
				updateIndicator(activeItem, enableTransition);
			});
		}

		const handleClick = (e: MouseEvent) => {
			const item = (e.target as HTMLElement).closest<HTMLElement>(
				'[data-part="item"]',
			);
			if (item && !item.hasAttribute("data-disabled")) {
				const newValue = item.getAttribute("data-value");
				if (newValue) {
					setValue(newValue);
					onValueChange?.(newValue);
				}
			}
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			const root = rootRef.current;
			if (!root) return;

			const items = Array.from(
				root.querySelectorAll<HTMLElement>(
					'[data-part="item"]:not([data-disabled])',
				),
			);

			const currentItem =
				(e.target as HTMLElement).closest<HTMLElement>('[data-part="item"]') ||
				root.querySelector<HTMLElement>(
					'[data-part="item"][data-state="checked"]:not([data-disabled])',
				) ||
				items[0];

			if (!currentItem) return;

			const index = items.indexOf(currentItem);

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
				const nextItem = items[nextIndex];
				nextItem.focus();
				const newValue = nextItem.getAttribute("data-value");
				if (newValue) {
					setValue(newValue);
					onValueChange?.(newValue);
				}
				e.preventDefault();
			}
		};

		root.addEventListener("click", handleClick);
		root.addEventListener("keydown", handleKeyDown);

		const observer = new ResizeObserver(() => {
			const activeItem = root.querySelector<HTMLElement>(
				`[data-part="item"][data-value="${value}"]`,
			);
			if (activeItem) {
				updateIndicator(activeItem);
			}
		});
		observer.observe(root);

		return () => {
			root.removeEventListener("click", handleClick);
			root.removeEventListener("keydown", handleKeyDown);
			observer.disconnect();
		};
	}, [value, onValueChange]);

	return (
		<Root
			{...rest}
			value={value}
			onValueChange={setValue}
			rootRef={rootRef}
			data-hydrated="true"
		>
			{children || <SegmentGroupStructure items={items} />}
		</Root>
	);
}
// island
