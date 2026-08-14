import { useEffect, useRef, useState } from "hono/jsx";
import { Root, type RootProps } from "../components/ui/tabs-primitive";

export interface TabsIslandProps extends RootProps {}

export default function TabsIsland(props: TabsIslandProps) {
	const {
		value: valueProp,
		defaultValue,
		orientation = "horizontal",
		activationMode = "automatic",
		loopFocus = true,
		lazyMount = false,
		unmountOnExit = false,
		onValueChange,
		onFocusChange,
		children,
		mountedValues: mountedValuesProp,
		...rest
	} = props;

	const rootRef = useRef<HTMLDivElement>(null);
	const initialValue = valueProp ?? defaultValue;
	const [value, setValue] = useState<string | undefined>(initialValue);
	const [focusedValue, setFocusedValue] = useState<string | undefined>(
		undefined,
	);
	const [mountedValues, setMountedValues] = useState<string[]>(
		mountedValuesProp ?? (initialValue !== undefined ? [initialValue] : []),
	);
	const [isMeasured, setIsMeasured] = useState(false);

	useEffect(() => {
		if (valueProp !== undefined) {
			setValue(valueProp);
			setMountedValues((prev) =>
				prev.includes(valueProp) ? prev : [...prev, valueProp],
			);
		}
	}, [valueProp]);

	const updateIndicator = (activeTrigger: HTMLElement) => {
		const root = rootRef.current;
		if (!root) return;

		const list = root.querySelector('[data-part="list"]') || root;
		const rect = activeTrigger.getBoundingClientRect();
		const listRect = list.getBoundingClientRect();

		const width = `${rect.width}px`;
		const height = `${rect.height}px`;
		const left = `${rect.left - listRect.left}px`;
		const top = `${rect.top - listRect.top}px`;

		const elementsToUpdate: HTMLElement[] = [];
		if (root) elementsToUpdate.push(root);
		const listEl = root.querySelector('[data-part="list"]');
		if (listEl instanceof HTMLElement) elementsToUpdate.push(listEl);

		for (const element of elementsToUpdate) {
			element.style.setProperty("--width", width);
			element.style.setProperty("--height", height);
			element.style.setProperty("--left", left);
			element.style.setProperty("--top", top);
		}
	};

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;

		const triggers = Array.from(
			root.querySelectorAll<HTMLElement>('[data-part="trigger"]'),
		);
		for (const trigger of triggers) {
			const tVal = trigger.getAttribute("data-value");
			const isSelected = tVal === value;
			const isFocused = tVal === focusedValue;
			const isDisabled =
				trigger.hasAttribute("disabled") ||
				trigger.getAttribute("aria-disabled") === "true";

			trigger.setAttribute("aria-selected", isSelected ? "true" : "false");
			trigger.setAttribute(
				"data-state",
				isSelected ? "selected" : "unselected",
			);
			if (isFocused) {
				trigger.setAttribute("data-focus", "");
			} else {
				trigger.removeAttribute("data-focus");
			}
			trigger.tabIndex = isSelected && !isDisabled ? 0 : -1;
		}

		const contents = Array.from(
			root.querySelectorAll<HTMLElement>('[data-part="content"]'),
		);
		for (const content of contents) {
			const cVal = content.getAttribute("data-value");
			const isSelected = cVal === value;

			content.setAttribute("data-state", isSelected ? "open" : "closed");
			if (isSelected) {
				content.removeAttribute("hidden");
				content.style.display = "";
			} else {
				content.setAttribute("hidden", "true");
				content.style.display = "none";
			}
		}

		const activeTrigger = root.querySelector<HTMLElement>(
			`[data-part="trigger"][data-value="${value}"]`,
		);
		if (activeTrigger) {
			requestAnimationFrame(() => {
				updateIndicator(activeTrigger);
				setIsMeasured(true);
			});
		}
	}, [value, focusedValue]);

	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;

		const handleResize = () => {
			const activeTrigger = root.querySelector<HTMLElement>(
				`[data-part="trigger"][data-value="${value}"]`,
			);
			if (activeTrigger) {
				updateIndicator(activeTrigger);
			}
		};

		const observer = new ResizeObserver(handleResize);
		observer.observe(root);

		const getTriggers = () =>
			Array.from(
				root.querySelectorAll<HTMLElement>('[data-part="trigger"]'),
			).filter(
				(el) =>
					!el.hasAttribute("disabled") &&
					el.getAttribute("aria-disabled") !== "true",
			);

		const changeValue = (newValue: string) => {
			setValue(newValue);
			setMountedValues((prev) =>
				prev.includes(newValue) ? prev : [...prev, newValue],
			);
			onValueChange?.({ value: newValue });
		};

		const handleClick = (e: MouseEvent) => {
			const trigger = (e.target as HTMLElement).closest<HTMLElement>(
				'[data-part="trigger"]',
			);
			if (
				trigger &&
				!trigger.hasAttribute("disabled") &&
				trigger.getAttribute("aria-disabled") !== "true"
			) {
				const newValue = trigger.getAttribute("data-value");
				if (newValue) {
					changeValue(newValue);
				}
			}
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			const activeElement = document.activeElement as HTMLElement;
			const isTrigger =
				activeElement &&
				activeElement.closest('[data-part="root"]') === root &&
				activeElement.getAttribute("data-part") === "trigger";
			if (!isTrigger) return;

			const triggers = getTriggers();
			const currentIndex = triggers.indexOf(activeElement);
			if (currentIndex === -1) return;

			let nextIndex = -1;
			const isRtl =
				root.dir === "rtl" ||
				root.getAttribute("dir") === "rtl" ||
				window.getComputedStyle(root).direction === "rtl";

			if (orientation === "horizontal") {
				if (e.key === "ArrowRight") {
					if (isRtl) {
						if (loopFocus) {
							nextIndex =
								(currentIndex - 1 + triggers.length) % triggers.length;
						} else {
							nextIndex = Math.max(currentIndex - 1, 0);
						}
					} else {
						if (loopFocus) {
							nextIndex = (currentIndex + 1) % triggers.length;
						} else {
							nextIndex = Math.min(currentIndex + 1, triggers.length - 1);
						}
					}
				} else if (e.key === "ArrowLeft") {
					if (isRtl) {
						if (loopFocus) {
							nextIndex = (currentIndex + 1) % triggers.length;
						} else {
							nextIndex = Math.min(currentIndex + 1, triggers.length - 1);
						}
					} else {
						if (loopFocus) {
							nextIndex =
								(currentIndex - 1 + triggers.length) % triggers.length;
						} else {
							nextIndex = Math.max(currentIndex - 1, 0);
						}
					}
				}
			} else {
				if (e.key === "ArrowDown") {
					if (loopFocus) {
						nextIndex = (currentIndex + 1) % triggers.length;
					} else {
						nextIndex = Math.min(currentIndex + 1, triggers.length - 1);
					}
				} else if (e.key === "ArrowUp") {
					if (loopFocus) {
						nextIndex = (currentIndex - 1 + triggers.length) % triggers.length;
					} else {
						nextIndex = Math.max(currentIndex - 1, 0);
					}
				}
			}

			if (e.key === "Home") {
				nextIndex = 0;
			} else if (e.key === "End") {
				nextIndex = triggers.length - 1;
			}

			if (nextIndex !== -1) {
				e.preventDefault();
				const nextTrigger = triggers[nextIndex];
				nextTrigger.focus();
				const newValue = nextTrigger.getAttribute("data-value");
				if (newValue) {
					setFocusedValue(newValue);
					onFocusChange?.({ value: newValue });

					if (activationMode === "automatic") {
						changeValue(newValue);
					}
				}
			}

			if (activationMode === "manual" && (e.key === " " || e.key === "Enter")) {
				e.preventDefault();
				const newValue = activeElement.getAttribute("data-value");
				if (newValue) {
					changeValue(newValue);
				}
			}
		};

		const handleFocusIn = (e: FocusEvent) => {
			const target = e.target as HTMLElement;
			if (target && target.getAttribute("data-part") === "trigger") {
				const focusedVal = target.getAttribute("data-value");
				if (focusedVal) {
					setFocusedValue(focusedVal);
					onFocusChange?.({ value: focusedVal });
				}
			}
		};

		const handleFocusOut = () => {
			setFocusedValue(undefined);
		};

		root.addEventListener("click", handleClick);
		root.addEventListener("keydown", handleKeyDown);
		root.addEventListener("focusin", handleFocusIn);
		root.addEventListener("focusout", handleFocusOut);

		return () => {
			observer.disconnect();
			root.removeEventListener("click", handleClick);
			root.removeEventListener("keydown", handleKeyDown);
			root.removeEventListener("focusin", handleFocusIn);
			root.removeEventListener("focusout", handleFocusOut);
		};
	}, [
		value,
		orientation,
		activationMode,
		loopFocus,
		onValueChange,
		onFocusChange,
	]);

	const handleValueChange = (details: { value: string }) => {
		setValue(details.value);
		setMountedValues((prev) =>
			prev.includes(details.value) ? prev : [...prev, details.value],
		);
	};

	return (
		<Root
			{...rest}
			value={value}
			orientation={orientation}
			activationMode={activationMode}
			loopFocus={loopFocus}
			lazyMount={lazyMount}
			unmountOnExit={unmountOnExit}
			onValueChange={handleValueChange}
			rootRef={rootRef}
			mountedValues={mountedValues}
			isMeasured={isMeasured}
			data-hydrated="true"
		>
			{children}
		</Root>
	);
}
// island
