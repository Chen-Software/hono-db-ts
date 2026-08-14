import { useEffect, useId, useRef, useState } from "hono/jsx";
import {
	type PinFieldFormat,
	Root,
	type RootProps,
} from "../components/ui/pin-field-primitive";

export type PinFieldIslandProps = RootProps;

function resolvePattern(format: PinFieldFormat, pattern?: string): RegExp {
	if (pattern) return new RegExp(pattern);
	switch (format) {
		case "alphabetic":
			return /^[a-zA-Z]$/;
		case "alphanumeric":
			return /^[a-zA-Z0-9]$/;
		default:
			return /^[0-9]$/;
	}
}

/** Mirrors the primitive's own `getActiveIndex` — the box a click/tab should land on next. */
function getActiveIndex(value: string[], count: number): number {
	const filled = value.reduce((n, v) => (v !== "" ? n + 1 : n), 0);
	return Math.min(filled, Math.max(count - 1, 0));
}

export default function PinFieldIsland(props: PinFieldIslandProps) {
	const {
		value: valueProp,
		defaultValue,
		count = 4,
		format = "numeric",
		pattern,
		blurOnComplete,
		autoFocus,
		selectOnFocus = true,
		disabled,
		readOnly,
		form,
		autoSubmit,
		onAutoSubmit,
		onValueChange,
		onValueComplete,
		onValueInvalid,
		children,
		id: idProp,
		...rest
	} = props;

	const initialValue =
		valueProp ?? defaultValue ?? Array.from({ length: count }, () => "");

	const [value, setValue] = useState<string[]>(initialValue);
	const valueRef = useRef<string[]>(initialValue);
	const wasCompleteRef = useRef(
		initialValue.length === count && initialValue.every((v) => v !== ""),
	);

	const fallbackId = useId();
	const rootId = idProp || `pin-field-${fallbackId}`;

	useEffect(() => {
		if (valueProp !== undefined) {
			setValue(valueProp);
			valueRef.current = valueProp;
		}
	}, [valueProp]);

	useEffect(() => {
		const root = document.getElementById(rootId);
		if (!root) return;
		if (autoFocus) {
			root
				.querySelector<HTMLInputElement>('[data-part="input"][data-index="0"]')
				?.focus();
		}
	}, [rootId, autoFocus]);

	useEffect(() => {
		const root = document.getElementById(rootId);
		if (!root) return;

		const re = resolvePattern(format, pattern);

		const getInputs = () =>
			Array.from(
				root.querySelectorAll<HTMLInputElement>('[data-part="input"]'),
			);

		const getIndex = (target: EventTarget | null): number | null => {
			const el = (target as HTMLElement)?.closest?.<HTMLInputElement>(
				'[data-part="input"]',
			);
			if (!el) return null;
			const index = Number(el.getAttribute("data-index"));
			return Number.isNaN(index) ? null : index;
		};

		// The hidden input carries the real `form` association (either via the
		// `form` prop's id or plain ancestry), so let the browser resolve it
		// rather than re-implementing id lookup here.
		const locateForm = (): HTMLFormElement | null => {
			const hiddenInput = root.querySelector<HTMLInputElement>(
				'[data-part="hidden-input"]',
			);
			return hiddenInput?.form ?? root.closest("form");
		};

		const attemptSubmit = () => {
			locateForm()?.requestSubmit();
		};

		const commit = (nextValue: string[]) => {
			valueRef.current = nextValue;
			setValue(nextValue);
			const valueAsString = nextValue.join("");
			onValueChange?.({ value: nextValue, valueAsString });
			const complete =
				nextValue.length === count && nextValue.every((v) => v !== "");
			if (complete && !wasCompleteRef.current) {
				onValueComplete?.({ value: nextValue, valueAsString });
				if (blurOnComplete) {
					(document.activeElement as HTMLElement | null)?.blur?.();
				}
				if (autoSubmit) {
					onAutoSubmit?.(valueAsString);
					attemptSubmit();
				}
			}
			wasCompleteRef.current = complete;
		};

		const focusIndex = (index: number) => {
			getInputs()
				.find((el) => Number(el.getAttribute("data-index")) === index)
				?.focus();
		};

		const fillFrom = (startIndex: number, chars: string[]) => {
			const nextValue = [...valueRef.current];
			let cursor = startIndex;
			for (const raw of chars) {
				if (cursor >= count) break;
				if (!re.test(raw)) {
					onValueInvalid?.({ index: cursor, value: raw });
					continue;
				}
				nextValue[cursor] = raw;
				cursor += 1;
			}
			commit(nextValue);
			const inputs = getInputs();
			const target = inputs.find(
				(el) =>
					Number(el.getAttribute("data-index")) === Math.min(cursor, count - 1),
			);
			target?.focus();
			if (target && cursor >= count) target.select?.();
		};

		const handleInput = (e: Event) => {
			const index = getIndex(e.target);
			if (index === null || disabled || readOnly) return;
			const target = e.target as HTMLInputElement;
			const raw = target.value;

			if (raw.length > 1) {
				target.value = valueRef.current[index] ?? "";
				fillFrom(index, raw.split(""));
				return;
			}

			if (raw === "") {
				const nextValue = [...valueRef.current];
				nextValue[index] = "";
				commit(nextValue);
				return;
			}

			if (!re.test(raw)) {
				target.value = valueRef.current[index] ?? "";
				onValueInvalid?.({ index, value: raw });
				return;
			}

			const nextValue = [...valueRef.current];
			nextValue[index] = raw;
			commit(nextValue);

			if (index < count - 1) {
				focusIndex(index + 1);
			} else if (blurOnComplete) {
				target.blur();
			}
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			const index = getIndex(e.target);
			if (index === null) return;
			const target = e.target as HTMLInputElement;

			if (e.key === "Backspace" && target.value === "" && index > 0) {
				e.preventDefault();
				const nextValue = [...valueRef.current];
				nextValue[index - 1] = "";
				commit(nextValue);
				focusIndex(index - 1);
				return;
			}

			if (e.key === "ArrowLeft" && index > 0) {
				e.preventDefault();
				focusIndex(index - 1);
				return;
			}

			if (e.key === "ArrowRight" && index < count - 1) {
				e.preventDefault();
				focusIndex(index + 1);
				return;
			}

			if (e.key === "ArrowUp" || e.key === "ArrowDown") {
				// Boxes are laid out horizontally; up/down have no meaning here
				// and would otherwise trigger native spinner-like behaviour.
				e.preventDefault();
				return;
			}

			if (e.key === "Enter") {
				// Multiple sibling inputs suppress the browser's native
				// submit-on-Enter, so drive it explicitly.
				e.preventDefault();
				attemptSubmit();
			}
		};

		const handlePaste = (e: ClipboardEvent) => {
			const index = getIndex(e.target);
			if (index === null || disabled || readOnly) return;
			e.preventDefault();
			const text = e.clipboardData?.getData("text") ?? "";
			if (!text) return;
			fillFrom(index, text.split(""));
		};

		const handleFocusIn = (e: FocusEvent) => {
			if (!selectOnFocus) return;
			const index = getIndex(e.target);
			if (index === null) return;
			(e.target as HTMLInputElement).select();
		};

		const handleMouseDown = (e: MouseEvent) => {
			if (disabled || readOnly) return;
			const index = getIndex(e.target);
			if (index === null) return;
			const activeIndex = getActiveIndex(valueRef.current, count);
			// Clicking ahead of the first empty box would otherwise let a user
			// jump into a box they haven't reached yet, faking a gap in the
			// value; redirect to the box they'd actually land on next instead.
			if (index > activeIndex) {
				e.preventDefault();
				focusIndex(activeIndex);
			}
		};

		const handleReset = () => {
			const empty = Array.from({ length: count }, () => "");
			commit(empty);
		};

		root.addEventListener("input", handleInput);
		root.addEventListener("keydown", handleKeyDown);
		root.addEventListener("paste", handlePaste);
		root.addEventListener("focusin", handleFocusIn);
		root.addEventListener("mousedown", handleMouseDown);
		const formEl = locateForm();
		formEl?.addEventListener("reset", handleReset);

		return () => {
			root.removeEventListener("input", handleInput);
			root.removeEventListener("keydown", handleKeyDown);
			root.removeEventListener("paste", handlePaste);
			root.removeEventListener("focusin", handleFocusIn);
			root.removeEventListener("mousedown", handleMouseDown);
			formEl?.removeEventListener("reset", handleReset);
		};
	}, [
		rootId,
		count,
		format,
		pattern,
		disabled,
		readOnly,
		selectOnFocus,
		blurOnComplete,
		autoSubmit,
		onAutoSubmit,
		onValueChange,
		onValueComplete,
		onValueInvalid,
	]);

	return (
		<Root
			{...rest}
			id={rootId}
			count={count}
			format={format}
			pattern={pattern}
			disabled={disabled}
			readOnly={readOnly}
			form={form}
			value={value}
			data-interactive="true"
		>
			{children}
		</Root>
	);
}
