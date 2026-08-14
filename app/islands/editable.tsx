import type { JSX } from "hono/jsx";
import { useEffect, useRef, useState } from "hono/jsx";
import {
	Content,
	Root,
	type RootProps,
} from "../components/ui/editable-primitive";

export interface EditableIslandProps extends RootProps {
	label?: JSX.Element | string;
}

export default function EditableIsland(props: EditableIslandProps) {
	const {
		value: valueProp,
		defaultValue,
		edit: editProp,
		defaultEdit,
		selectOnFocus = true,
		disabled,
		readOnly,
		placeholder,
		onValueChange,
		onValueCommit,
		onValueRevert,
		onEditChange,
		label,
		helperText,
		errorText,
		children,
		activationMode = "focus",
		...rest
	} = props;

	const [value, setValueState] = useState(valueProp ?? defaultValue ?? "");
	const [editing, setEditing] = useState(editProp ?? defaultEdit ?? false);
	const rootRef = useRef<HTMLDivElement>(null);
	const previousValue = useRef(value);
	const isClickingTriggerRef = useRef(false);

	// Synchronous derivation of state to prevent "frozen input" bugs in static pages/contexts
	const lastExternalValue = useRef(valueProp);
	if (valueProp !== undefined && valueProp !== lastExternalValue.current) {
		setValueState(valueProp);
		lastExternalValue.current = valueProp;
	}

	const lastExternalEdit = useRef(editProp);
	if (editProp !== undefined && editProp !== lastExternalEdit.current) {
		setEditing(editProp);
		lastExternalEdit.current = editProp;
	}

	// Detect if pointer is clicking on the cancel or submit trigger to bypass blur auto-submission (Safari/Firefox compatibility)
	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;

		const handlePointerDown = (e: PointerEvent) => {
			const target = e.target as HTMLElement;
			if (
				target.closest('[data-part="submit-trigger"]') ||
				target.closest('[data-part="cancel-trigger"]')
			) {
				isClickingTriggerRef.current = true;
			}
		};

		const handlePointerUp = () => {
			isClickingTriggerRef.current = false;
		};

		root.addEventListener("pointerdown", handlePointerDown);
		window.addEventListener("pointerup", handlePointerUp, { capture: true });

		return () => {
			root.removeEventListener("pointerdown", handlePointerDown);
			window.removeEventListener("pointerup", handlePointerUp, {
				capture: true,
			});
		};
	}, []);

	// Listen to parent form's reset event to restore initial values
	useEffect(() => {
		const root = rootRef.current;
		if (!root) return;

		const formEl = root.closest("form");
		if (!formEl) return;

		const handleReset = () => {
			const initialValue = defaultValue ?? valueProp ?? "";
			setValueState(initialValue);
			setEditing(false);
		};

		formEl.addEventListener("reset", handleReset);
		return () => {
			formEl.removeEventListener("reset", handleReset);
		};
	}, [defaultValue, valueProp]);

	const focusInput = () => {
		const input = rootRef.current?.querySelector<HTMLInputElement>(
			'[data-part="input"]',
		);
		if (!input) return;
		input.focus();
		if (selectOnFocus) input.select();
	};

	// Restores focus to the edit trigger (if present) or preview element (fallback)
	// only when triggered by explicit user actions (not on standard blur)
	const restoreFocus = (options?: { restoreFocus?: boolean }) => {
		if (options?.restoreFocus === false) return;

		const root = rootRef.current;
		if (!root) return;

		const editTrigger = root.querySelector<HTMLElement>(
			'[data-part="edit-trigger"]',
		);
		if (
			editTrigger &&
			!editTrigger.hasAttribute("hidden") &&
			!editTrigger.hasAttribute("disabled")
		) {
			editTrigger.focus({ preventScroll: true });
			return;
		}

		if (activationMode !== "focus") {
			const preview = root.querySelector<HTMLElement>('[data-part="preview"]');
			preview?.focus({ preventScroll: true });
		}
	};

	const handleEdit = () => {
		if (disabled || readOnly || editing) return;
		previousValue.current = value;
		if (editProp === undefined) setEditing(true);
		onEditChange?.({ edit: true });
		requestAnimationFrame(focusInput);
	};

	const handleCancel = (options?: { restoreFocus?: boolean }) => {
		if (disabled) return;
		const reverted = previousValue.current;
		if (valueProp === undefined) setValueState(reverted);
		if (editProp === undefined) setEditing(false);
		onValueRevert?.({ value: reverted });
		onEditChange?.({ edit: false });
		requestAnimationFrame(() => restoreFocus(options));
	};

	const handleSubmit = (options?: { restoreFocus?: boolean }) => {
		if (disabled) return;
		if (isClickingTriggerRef.current) return;
		previousValue.current = value;
		if (editProp === undefined) setEditing(false);
		onValueCommit?.({ value });
		onEditChange?.({ edit: false });
		requestAnimationFrame(() => restoreFocus(options));
	};

	const handleSetValue = (next: string) => {
		if (valueProp === undefined) setValueState(next);
		onValueChange?.({ value: next });
	};

	return (
		<Root
			{...rest}
			activationMode={activationMode}
			rootRef={rootRef}
			value={value}
			edit={editing}
			disabled={disabled}
			readOnly={readOnly}
			placeholder={placeholder}
			onEdit={handleEdit}
			onCancel={handleCancel}
			onSubmit={handleSubmit}
			onSetValue={handleSetValue}
			data-hydrated="true"
			helperText={helperText}
			errorText={errorText}
		>
			<Content label={label} helperText={helperText} errorText={errorText}>
				{children}
			</Content>
		</Root>
	);
}
