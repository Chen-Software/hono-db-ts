import { useEffect, useId, useRef, useState } from "hono/jsx";
import {
	CalendarDate,
	DatePickerRoot,
	type DatePickerRootProps,
	DatePickerStructure,
	daysInMonth,
	fromJSDate,
	isValidDateString,
	parseDate,
	parseSingleDate,
	parseValue,
} from "../components/ui/date-picker-primitive";

const PRESET_DAYS: Record<string, number> = {
	today: 0,
	last3Days: 3,
	last7Days: 7,
	last14Days: 14,
	last30Days: 30,
	last90Days: 90,
};

export default function DatePickerIsland(props: DatePickerRootProps) {
	const {
		open: openProp,
		value: valueProp,
		defaultValue,
		focusedValue: focusedValueProp,
		defaultFocusedValue,
		view: viewProp,
		selectionMode = "single",
		closeOnSelect = true,
		onValueChange,
		onOpenChange,
		id: idProp,
		children,
		label,
		placeholder,
		...rest
	} = props;

	const fallbackId = useId();
	const rootId = idProp || `date-picker-${fallbackId}`;

	// open state
	const [isOpen, setIsOpen] = useState(openProp ?? false);
	const open = openProp !== undefined ? openProp : isOpen;

	// value state
	const initialValue = parseValue(valueProp ?? defaultValue);
	const [value, setValue] = useState<CalendarDate[]>(initialValue);
	const currentValue = valueProp !== undefined ? parseValue(valueProp) : value;

	// view state
	const [view, setView] = useState<"day" | "month" | "year">(viewProp ?? "day");
	const currentView = viewProp !== undefined ? viewProp : view;

	// focusedValue state
	const initialFocused =
		parseSingleDate(focusedValueProp ?? defaultFocusedValue) ??
		(currentValue[0] || fromJSDate(new Date()));
	const [focusedValue, setFocusedValue] =
		useState<CalendarDate>(initialFocused);
	const currentFocusedValue = parseSingleDate(focusedValueProp) ?? focusedValue;

	const minDate = parseSingleDate(props.min);
	const maxDate = parseSingleDate(props.max);

	// When true, the grid cell matching `currentFocusedValue` should receive
	// DOM focus after the next render (used for keyboard navigation + open).
	const focusGrid = useRef(false);

	// Keep refs for event handlers to avoid closure stale state
	const stateRef = useRef({
		open,
		value: currentValue,
		view: currentView,
		focusedValue: currentFocusedValue,
		selectionMode,
		closeOnSelect,
	});

	useEffect(() => {
		stateRef.current = {
			open,
			value: currentValue,
			view: currentView,
			focusedValue: currentFocusedValue,
			selectionMode,
			closeOnSelect,
		};
	}, [
		open,
		currentValue,
		currentView,
		currentFocusedValue,
		selectionMode,
		closeOnSelect,
	]);

	const updateValue = (nextValues: CalendarDate[]) => {
		setValue(nextValues);
		onValueChange?.({ value: nextValues });
	};

	const handleOpenChange = (nextOpen: boolean) => {
		setIsOpen(nextOpen);
		onOpenChange?.({ open: nextOpen });
	};

	const focusTrigger = () => {
		const root = document.getElementById(rootId);
		const trigger = root?.querySelector<HTMLElement>('[data-part="trigger"]');
		trigger?.focus();
	};

	const closeAndRestoreFocus = () => {
		handleOpenChange(false);
		focusTrigger();
	};

	const isOutOfRange = (date: CalendarDate) => {
		const time = date.toDate().getTime();
		if (minDate && time < minDate.toDate().getTime()) return true;
		if (maxDate && time > maxDate.toDate().getTime()) return true;
		return false;
	};

	// Clamp a date into the selectable [min, max] range so keyboard focus can
	// never land on a disabled cell. Used for all keyboard-driven moves.
	const clampToRange = (date: CalendarDate): CalendarDate => {
		if (minDate && date.toDate().getTime() < minDate.toDate().getTime()) {
			return new CalendarDate(minDate.year, minDate.month, minDate.day);
		}
		if (maxDate && date.toDate().getTime() > maxDate.toDate().getTime()) {
			return new CalendarDate(maxDate.year, maxDate.month, maxDate.day);
		}
		return date;
	};

	const handleGoToNext = () => {
		const { view: activeView, focusedValue: fv } = stateRef.current;
		if (activeView === "day") {
			const nextMonth = fv.month === 12 ? 1 : fv.month + 1;
			const nextYear = fv.month === 12 ? fv.year + 1 : fv.year;
			setFocusedValue(new CalendarDate(nextYear, nextMonth, 1));
		} else if (activeView === "month") {
			setFocusedValue(new CalendarDate(fv.year + 1, fv.month, 1));
		} else {
			setFocusedValue(new CalendarDate(fv.year + 10, fv.month, 1));
		}
	};

	const handleGoToPrev = () => {
		const { view: activeView, focusedValue: fv } = stateRef.current;
		if (activeView === "day") {
			const prevMonth = fv.month === 1 ? 12 : fv.month - 1;
			const prevYear = fv.month === 1 ? fv.year - 1 : fv.year;
			setFocusedValue(new CalendarDate(prevYear, prevMonth, 1));
		} else if (activeView === "month") {
			setFocusedValue(new CalendarDate(fv.year - 1, fv.month, 1));
		} else {
			setFocusedValue(new CalendarDate(fv.year - 10, fv.month, 1));
		}
	};

	const handleViewTrigger = () => {
		const { view: activeView } = stateRef.current;
		if (activeView === "day") {
			setView("month");
		} else if (activeView === "month") {
			setView("year");
		} else {
			setView("day");
		}
		// The previous view (and the control that had focus) is now hidden, so
		// move focus onto the active cell of the new view.
		focusGrid.current = true;
	};

	const handleCellClick = (cellVal: CalendarDate | number) => {
		const {
			view: activeView,
			value: vals,
			selectionMode: mode,
			closeOnSelect: cos,
		} = stateRef.current;

		if (activeView === "day" && cellVal instanceof CalendarDate) {
			let nextValues: CalendarDate[] = [];
			if (mode === "single") {
				nextValues = [cellVal];
				if (cos) {
					closeAndRestoreFocus();
				}
			} else if (mode === "multiple") {
				const valStr = cellVal.toString();
				if (vals.some((v) => v.toString() === valStr)) {
					nextValues = vals.filter((v) => v.toString() !== valStr);
				} else {
					nextValues = [...vals, cellVal];
				}
			} else if (mode === "range") {
				if (vals.length === 0 || vals.length === 2) {
					nextValues = [cellVal];
				} else {
					const start = vals[0];
					const end = cellVal;
					if (start.toDate().getTime() <= end.toDate().getTime()) {
						nextValues = [start, end];
					} else {
						nextValues = [end, start];
					}
					if (cos) {
						closeAndRestoreFocus();
					}
				}
			}
			updateValue(nextValues);
			setFocusedValue(cellVal);
		} else if (activeView === "month" && typeof cellVal === "number") {
			const { focusedValue: fv } = stateRef.current;
			setFocusedValue(new CalendarDate(fv.year, cellVal, 1));
			setView("day");
			focusGrid.current = true;
		} else if (activeView === "year" && typeof cellVal === "number") {
			const { focusedValue: fv } = stateRef.current;
			setFocusedValue(new CalendarDate(cellVal, fv.month, 1));
			setView("month");
			focusGrid.current = true;
		}
	};

	const handlePresetClick = (presetType: string) => {
		const days = PRESET_DAYS[presetType];
		if (days === undefined) {
			return;
		}
		const today = new Date();
		const start = new Date();
		start.setDate(today.getDate() - days);
		const startVal = fromJSDate(start);
		const endVal = fromJSDate(today);
		const nextValues =
			stateRef.current.selectionMode === "range"
				? [startVal, endVal]
				: [days === 0 ? endVal : startVal];
		updateValue(nextValues);
		setFocusedValue(endVal);
		if (closeOnSelect) {
			closeAndRestoreFocus();
		}
	};

	// Commit a manually typed date. Invalid or out-of-range text reverts to
	// the last committed value for that input. The input is uncontrolled, so
	// this only runs on blur / Enter — users can type freely in between.
	const handleInputCommit = (input: HTMLInputElement) => {
		const index = Number(input.getAttribute("data-index") || "0");
		const raw = input.value.trim();
		const { value: vals, selectionMode: mode } = stateRef.current;
		const revert = () => {
			input.value = vals[index]?.toString() ?? "";
		};

		if (raw === "") {
			if (vals.length > 0) {
				updateValue(
					mode === "single" ? [] : vals.filter((_, i) => i !== index),
				);
			}
			return;
		}

		if (!isValidDateString(raw)) {
			revert();
			return;
		}

		const parsed = parseDate(raw);
		if (isOutOfRange(parsed)) {
			revert();
			return;
		}

		let nextValues: CalendarDate[];
		if (mode === "single") {
			nextValues = [parsed];
		} else {
			nextValues = [...vals];
			nextValues[index] = parsed;
			nextValues = nextValues.filter(Boolean);
			if (
				mode === "range" &&
				nextValues.length === 2 &&
				nextValues[0].toDate().getTime() > nextValues[1].toDate().getTime()
			) {
				nextValues = [nextValues[1], nextValues[0]];
			}
		}
		updateValue(nextValues);
		setFocusedValue(parsed);
	};

	// Sync the uncontrolled input DOM value with external state changes
	// (calendar selection, clear, preset) — but never while the user is typing.
	useEffect(() => {
		const root = document.getElementById(rootId);
		if (!root) return;
		root
			.querySelectorAll<HTMLInputElement>('[data-part="input"]')
			.forEach((input) => {
				if (document.activeElement !== input) {
					const idx = Number(input.getAttribute("data-index") || "0");
					input.value = currentValue[idx]?.toString() ?? "";
				}
			});
	}, [rootId, currentValue]);

	// Move DOM focus to the active grid cell when keyboard navigation or a
	// keyboard-open requests it.
	useEffect(() => {
		if (!focusGrid.current) return;
		focusGrid.current = false;
		if (!open) return;
		const root = document.getElementById(rootId);
		if (!root) return;
		let selector = "";
		if (currentView === "day") {
			selector = `[data-part="table-cell-trigger"][data-view="day"][data-value="${currentFocusedValue.toString()}"]`;
		} else if (currentView === "month") {
			selector = `[data-part="table-cell-trigger"][data-view="month"][data-value="${currentFocusedValue.month}"]`;
		} else {
			selector = `[data-part="table-cell-trigger"][data-view="year"][data-value="${currentFocusedValue.year}"]`;
		}
		root.querySelector<HTMLElement>(selector)?.focus();
	}, [currentFocusedValue, currentView, open]);

	// DOM interaction effects
	useEffect(() => {
		const root = document.getElementById(rootId);
		if (!root) return;

		const moveFocused = (next: CalendarDate) => {
			setFocusedValue(clampToRange(next));
			focusGrid.current = true;
		};

		const handleClick = (e: MouseEvent) => {
			const target = e.target as HTMLElement;

			// Clear trigger
			if (target.closest('[data-part="clear-trigger"]')) {
				updateValue([]);
				return;
			}

			// Main popover trigger
			if (target.closest('[data-part="trigger"]')) {
				handleOpenChange(!stateRef.current.open);
				return;
			}

			// Clicking an input opens the calendar
			if (target.closest('[data-part="input"]')) {
				if (!stateRef.current.open) {
					handleOpenChange(true);
				}
				return;
			}

			// View triggers
			if (target.closest('[data-part="prev-trigger"]')) {
				handleGoToPrev();
				return;
			}
			if (target.closest('[data-part="next-trigger"]')) {
				handleGoToNext();
				return;
			}
			if (target.closest('[data-part="view-trigger"]')) {
				handleViewTrigger();
				return;
			}

			// Preset triggers
			const preset = target.closest('[data-part="preset-trigger"]');
			if (preset) {
				const val = preset.getAttribute("data-value") || "";
				handlePresetClick(val);
				return;
			}

			// Cell triggers carry their value in data-value
			const cellTrigger = target.closest('[data-part="table-cell-trigger"]');
			if (cellTrigger && !cellTrigger.hasAttribute("data-disabled")) {
				const rawValue = cellTrigger.getAttribute("data-value");
				if (!rawValue) return;
				if (cellTrigger.getAttribute("data-view") === "day") {
					if (isValidDateString(rawValue)) {
						handleCellClick(parseDate(rawValue));
					}
				} else {
					const numeric = Number(rawValue);
					if (!Number.isNaN(numeric)) {
						handleCellClick(numeric);
					}
				}
			}
		};

		const handleChange = (e: Event) => {
			const target = e.target as HTMLElement;
			const part = target.getAttribute("data-part");
			if (part === "month-select") {
				const monthVal = Number((target as HTMLSelectElement).value);
				setFocusedValue(
					new CalendarDate(stateRef.current.focusedValue.year, monthVal, 1),
				);
			} else if (part === "year-select") {
				const yearVal = Number((target as HTMLSelectElement).value);
				setFocusedValue(
					new CalendarDate(yearVal, stateRef.current.focusedValue.month, 1),
				);
			} else if (part === "input") {
				handleInputCommit(target as HTMLInputElement);
			}
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			const part = target.getAttribute("data-part");

			// Enter commits a typed date from the input
			if (part === "input" && e.key === "Enter") {
				e.preventDefault();
				handleInputCommit(target as HTMLInputElement);
				return;
			}

			// Keyboard open from the trigger → move focus into the grid
			if (part === "trigger" && (e.key === "Enter" || e.key === " ")) {
				e.preventDefault();
				const willOpen = !stateRef.current.open;
				handleOpenChange(willOpen);
				if (willOpen) focusGrid.current = true;
				return;
			}

			if (!stateRef.current.open) return;

			const cell = target.closest(
				'[data-part="table-cell-trigger"]',
			) as HTMLElement | null;
			if (!cell) return;
			const view = cell.getAttribute("data-view");
			const fv = stateRef.current.focusedValue;

			const stepDays = (days: number) => {
				const d = fv.toDate();
				d.setDate(d.getDate() + days);
				moveFocused(fromJSDate(d));
			};
			const stepMonths = (months: number) => {
				let m = fv.month + months;
				let y = fv.year;
				while (m < 1) {
					m += 12;
					y--;
				}
				while (m > 12) {
					m -= 12;
					y++;
				}
				// Clamp the day so month rollover never drifts past month end
				// (e.g. Jan 31 -> Feb 28, not Feb 31 -> Mar 3).
				const day = Math.min(fv.day, daysInMonth(y, m));
				moveFocused(new CalendarDate(y, m, day));
			};
			const stepYears = (years: number) => {
				const y = fv.year + years;
				// Clamp the day for Feb 29 -> non-leap-year rollover.
				const day = Math.min(fv.day, daysInMonth(y, fv.month));
				moveFocused(new CalendarDate(y, fv.month, day));
			};

			switch (e.key) {
				case "ArrowRight":
					e.preventDefault();
					if (view === "day") stepDays(1);
					else if (view === "month") stepMonths(1);
					else stepYears(1);
					break;
				case "ArrowLeft":
					e.preventDefault();
					if (view === "day") stepDays(-1);
					else if (view === "month") stepMonths(-1);
					else stepYears(-1);
					break;
				case "ArrowDown":
					e.preventDefault();
					if (view === "day") stepDays(7);
					else if (view === "month") stepMonths(3);
					else stepYears(3);
					break;
				case "ArrowUp":
					e.preventDefault();
					if (view === "day") stepDays(-7);
					else if (view === "month") stepMonths(-3);
					else stepYears(-3);
					break;
				case "Home":
					if (view === "day") {
						e.preventDefault();
						const offset = (fv.toDate().getDay() - 0 + 7) % 7;
						stepDays(-offset);
					}
					break;
				case "End":
					if (view === "day") {
						e.preventDefault();
						const offset = (fv.toDate().getDay() - 0 + 7) % 7;
						stepDays(6 - offset);
					}
					break;
				case "PageUp":
					e.preventDefault();
					if (view === "day") {
						if (e.shiftKey) stepYears(-1);
						else stepMonths(-1);
					} else if (view === "month") stepYears(-1);
					else stepYears(-10);
					break;
				case "PageDown":
					e.preventDefault();
					if (view === "day") {
						if (e.shiftKey) stepYears(1);
						else stepMonths(1);
					} else if (view === "month") stepYears(1);
					else stepYears(10);
					break;
				case "Enter":
				case " ":
					e.preventDefault();
					if (cell.hasAttribute("data-disabled")) return;
					if (view === "day") {
						const raw = cell.getAttribute("data-value") || "";
						if (isValidDateString(raw)) handleCellClick(parseDate(raw));
					} else {
						const n = Number(cell.getAttribute("data-value"));
						if (!Number.isNaN(n)) handleCellClick(n);
					}
					break;
				default:
					break;
			}
		};

		const handleMouseOver = (e: MouseEvent) => {
			const cell = (e.target as HTMLElement).closest(
				'[data-part="table-cell-trigger"][data-view="day"]',
			) as HTMLElement | null;
			if (!cell || cell.hasAttribute("data-disabled")) return;
			const st = stateRef.current;
			if (st.selectionMode !== "range" || st.value.length !== 1) return;
			const start = st.value[0];
			const hovered = parseDate(cell.getAttribute("data-value") || "");
			const lo = Math.min(start.toDate().getTime(), hovered.toDate().getTime());
			const hi = Math.max(start.toDate().getTime(), hovered.toDate().getTime());
			root
				.querySelectorAll<HTMLElement>(
					'[data-part="table-cell-trigger"][data-view="day"]',
				)
				.forEach((el) => {
					const t = parseDate(el.getAttribute("data-value") || "")
						.toDate()
						.getTime();
					if (t > lo && t < hi) el.setAttribute("data-range-preview", "");
					else el.removeAttribute("data-range-preview");
				});
		};

		const handleMouseOut = () => {
			root
				.querySelectorAll<HTMLElement>(
					'[data-part="table-cell-trigger"][data-view="day"][data-range-preview]',
				)
				.forEach((el) => {
					el.removeAttribute("data-range-preview");
				});
		};

		const handleDocumentKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && stateRef.current.open) {
				e.stopPropagation();
				closeAndRestoreFocus();
			}
		};

		const handleDocumentClick = (e: MouseEvent) => {
			if (stateRef.current.open && !root.contains(e.target as Node)) {
				handleOpenChange(false);
			}
		};

		root.addEventListener("click", handleClick);
		root.addEventListener("change", handleChange);
		root.addEventListener("keydown", handleKeyDown);
		root.addEventListener("mouseover", handleMouseOver);
		root.addEventListener("mouseout", handleMouseOut);
		document.addEventListener("click", handleDocumentClick);
		document.addEventListener("keydown", handleDocumentKeyDown);

		return () => {
			root.removeEventListener("click", handleClick);
			root.removeEventListener("change", handleChange);
			root.removeEventListener("keydown", handleKeyDown);
			root.removeEventListener("mouseover", handleMouseOver);
			root.removeEventListener("mouseout", handleMouseOut);
			document.removeEventListener("click", handleDocumentClick);
			document.removeEventListener("keydown", handleDocumentKeyDown);
		};
	}, [rootId]);

	return (
		<DatePickerRoot
			{...rest}
			id={rootId}
			open={open}
			value={currentValue}
			focusedValue={currentFocusedValue}
			view={currentView}
			selectionMode={selectionMode}
		>
			{children || (
				<DatePickerStructure
					selectionMode={selectionMode}
					label={label}
					placeholder={placeholder}
				/>
			)}
		</DatePickerRoot>
	);
}
