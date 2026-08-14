import { useEffect, useId, useState } from "hono/jsx";
import { Root, type RootProps } from "../components/ui/rating-group-primitive";

function clamp(value: number, count: number) {
	return Math.max(0, Math.min(count, value));
}

function RatingGroupIsland(props: RootProps) {
	const {
		value: valueProp,
		defaultValue,
		count = 5,
		allowHalf = false,
		disabled,
		readOnly,
		id: idProp,
		onValueChange,
		onHoveredValueChange,
		...rest
	} = props;

	const [value, setValue] = useState(
		clamp(valueProp ?? defaultValue ?? 0, count),
	);
	const fallbackId = useId();
	const id = idProp || fallbackId;

	useEffect(() => {
		if (valueProp !== undefined) {
			setValue(clamp(valueProp, count));
		}
	}, [valueProp, count]);

	const commitValue = (next: number) => {
		const clamped = clamp(next, count);
		if (valueProp === undefined) {
			setValue(clamped);
		}
		onValueChange?.({ value: clamped });
	};

	// DOM-delegation island: the item list is rendered by `Root` itself (see
	// rating-group-primitive.tsx's auto-assembled children), driven by the
	// same `count`/`allowHalf`/`icon` props on both SSR and hydration passes,
	// so there's no JSX-children-across-the-hydration-boundary to go stale —
	// see [[honox-island-children-not-live]] / the "children lose provider
	// context" gotcha in [[park-ui-cli-port-gotchas]].
	useEffect(() => {
		if (disabled || readOnly) return;
		const root = document.getElementById(id);
		if (!root) return;
		const control = root.querySelector<HTMLElement>('[data-part="control"]');
		if (!control) return;

		let hoveredValue: number | null = null;

		const isRtl = () => getComputedStyle(control).direction === "rtl";

		const valueFromItem = (item: Element, clientX: number) => {
			const index = Number(item.getAttribute("data-index"));
			if (!Number.isFinite(index)) return null;
			if (!allowHalf) return index;
			const rect = item.getBoundingClientRect();
			if (rect.width <= 0) return index;
			const fraction = (clientX - rect.left) / rect.width;
			const rightHalf = isRtl() ? fraction < 0.5 : fraction >= 0.5;
			return rightHalf ? index : index - 0.5;
		};

		const items = () =>
			Array.from(root.querySelectorAll<HTMLElement>('[data-part="item"]'));

		const applyDisplayValue = (displayValue: number) => {
			const floorValue = Math.floor(displayValue);
			const hasHalf = allowHalf && displayValue - floorValue >= 0.5;
			const activeIndex = displayValue > 0 ? Math.ceil(displayValue) : 1;

			for (const item of items()) {
				const index = Number(item.getAttribute("data-index"));
				const half = hasHalf && index === floorValue + 1;
				const highlighted = index <= floorValue || half;
				const checked = displayValue > 0 && index === Math.ceil(displayValue);

				item.setAttribute("data-state", checked ? "checked" : "unchecked");
				item.setAttribute("aria-checked", checked ? "true" : "false");
				item.toggleAttribute("data-highlighted", highlighted);
				item.toggleAttribute("data-half", half);
				item.tabIndex = index === activeIndex ? 0 : -1;

				const indicator = item.querySelector('[data-part="item-indicator"]');
				if (indicator) {
					indicator.toggleAttribute("data-highlighted", highlighted);
					indicator.toggleAttribute("data-half", half);
				}
			}

			const hiddenInput = root.querySelector<HTMLInputElement>(
				'input[type="hidden"]',
			);
			if (hiddenInput) hiddenInput.value = String(displayValue);
		};

		applyDisplayValue(value);

		const handlePointerMove = (e: MouseEvent) => {
			const item = (e.target as HTMLElement).closest('[data-part="item"]');
			if (!item) return;
			const next = valueFromItem(item, e.clientX);
			if (next === null || next === hoveredValue) return;
			hoveredValue = next;
			onHoveredValueChange?.({ hoveredValue: next });
			applyDisplayValue(next);
		};

		const handlePointerLeave = () => {
			if (hoveredValue === null) return;
			hoveredValue = null;
			onHoveredValueChange?.({ hoveredValue: null });
			applyDisplayValue(value);
		};

		const handleClick = (e: MouseEvent) => {
			const item = (e.target as HTMLElement).closest('[data-part="item"]');
			if (!item) return;
			const next = valueFromItem(item, e.clientX);
			if (next === null) return;
			commitValue(next);
		};

		const step = allowHalf ? 0.5 : 1;
		const handleKeyDown = (e: KeyboardEvent) => {
			const activeElement = document.activeElement;
			if (!activeElement || !root.contains(activeElement)) return;
			const currentItem = activeElement.closest('[data-part="item"]');
			if (!currentItem) return;

			const rtl = isRtl();
			let next: number | null = null;
			if (e.key === "ArrowRight") {
				next = value + (rtl ? -step : step);
			} else if (e.key === "ArrowLeft") {
				next = value + (rtl ? step : -step);
			} else if (e.key === "ArrowUp") {
				next = value + step;
			} else if (e.key === "ArrowDown") {
				next = value - step;
			} else if (e.key === "Home") {
				next = 0;
			} else if (e.key === "End") {
				next = count;
			} else {
				return;
			}

			e.preventDefault();
			const clamped = clamp(next, count);
			commitValue(clamped);

			const activeIndex = clamped > 0 ? Math.ceil(clamped) : 1;
			const nextItem = items().find(
				(el) => Number(el.getAttribute("data-index")) === activeIndex,
			);
			nextItem?.focus();
		};

		control.addEventListener("mousemove", handlePointerMove);
		control.addEventListener("mouseleave", handlePointerLeave);
		control.addEventListener("click", handleClick);
		control.addEventListener("keydown", handleKeyDown);

		return () => {
			control.removeEventListener("mousemove", handlePointerMove);
			control.removeEventListener("mouseleave", handlePointerLeave);
			control.removeEventListener("click", handleClick);
			control.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		value,
		count,
		allowHalf,
		disabled,
		readOnly,
		id,
		onHoveredValueChange,
		onValueChange,
	]);

	return (
		<Root
			{...rest}
			id={id}
			count={count}
			allowHalf={allowHalf}
			disabled={disabled}
			readOnly={readOnly}
			value={value}
			data-hydrated="true"
		/>
	);
}

export default RatingGroupIsland;
