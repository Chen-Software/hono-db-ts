import { css, cx } from "design-system/css";
import type { EditableVariantProps } from "design-system/recipes";
import { editable } from "design-system/recipes";
import {
	type Child,
	createContext,
	type JSX,
	type PropsWithChildren,
	useContext,
	useId,
	useState,
} from "hono/jsx";
import { InteractiveCombobox } from "./combobox-primitive";

type EditableStyles = ReturnType<typeof editable>;

export type EditableActivationMode = "focus" | "dblclick" | "click" | "none";
export type EditableSubmitMode = "enter" | "blur" | "both" | "none";
export type EditablePlaceholder = string | { edit: string; preview: string };

export interface EditableComboboxItem {
	label: string;
	value: string;
	disabled?: boolean;
}

export interface EditableTranslations {
	edit?: string;
	submit?: string;
	cancel?: string;
	input?: string;
}

const defaultTranslations: Required<EditableTranslations> = {
	edit: "Edit",
	submit: "Submit",
	cancel: "Cancel",
	input: "Edit value",
};

/** `tags` mode stores its list as a comma-separated string in `value`. */
function parseTags(value: string): string[] {
	return value
		.split(",")
		.map((tag) => tag.trim())
		.filter(Boolean);
}

export interface EditableContextValue {
	value: string;
	editing: boolean;
	empty: boolean;
	valueText: string;
	disabled?: boolean;
	readOnly?: boolean;
	invalid?: boolean;
	required?: boolean;
	autoResize?: boolean;
	multiline?: boolean;
	/** Textarea row count when `multiline` is set. @default 3 */
	rows?: number;
	/** Renders the input as a searchable combobox instead of a plain text input. */
	combobox?: boolean;
	/** Options for `combobox` mode. Preview shows the matching label, not the raw value. */
	items?: EditableComboboxItem[];
	/** Renders the value as a tag list (comma-separated string) with an add/remove editor. */
	tags?: boolean;
	activationMode: EditableActivationMode;
	submitMode: EditableSubmitMode;
	selectOnFocus: boolean;
	placeholder?: { edit?: string; preview?: string };
	translations: Required<EditableTranslations>;
	maxLength?: number;
	name?: string;
	form?: string;
	hasHelperText: boolean;
	hasErrorText: boolean;
	styles: EditableStyles;
	ids: {
		area: string;
		label: string;
		preview: string;
		input: string;
		editTrigger: string;
		submitTrigger: string;
		cancelTrigger: string;
		control: string;
		helperText: string;
		errorText: string;
	};
	/** Enters edit mode. No-op until hydrated. */
	edit: () => void;
	/** Exits edit mode, discarding changes. No-op until hydrated. */
	cancel: (options?: { restoreFocus?: boolean }) => void;
	/** Exits edit mode, committing changes. No-op until hydrated. */
	submit: (options?: { restoreFocus?: boolean }) => void;
	/** Sets the value directly (e.g. from the input's onChange). No-op until hydrated. */
	setValue: (value: string) => void;
}

const EditableContext = createContext<EditableContextValue | null>(null);

export const useEditableContext = () => useContext(EditableContext);

export interface RootProps extends EditableVariantProps, PropsWithChildren {
	class?: string;
	id?: string;
	value?: string;
	defaultValue?: string;
	edit?: boolean;
	defaultEdit?: boolean;
	/** @default "focus" */
	activationMode?: EditableActivationMode;
	/** @default "both" */
	submitMode?: EditableSubmitMode;
	/** @default true */
	selectOnFocus?: boolean;
	autoResize?: boolean;
	/** Renders the input as a resizable `<textarea>` instead of a single-line `<input>`. */
	multiline?: boolean;
	/** Textarea row count when `multiline` is set. @default 3 */
	rows?: number;
	/** Renders the input as a searchable combobox instead of a plain text input. */
	combobox?: boolean;
	/** Options for `combobox` mode. Preview shows the matching label, not the raw value. */
	items?: EditableComboboxItem[];
	/** Renders the value as a tag list (comma-separated string) with an add/remove editor. */
	tags?: boolean;
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	invalid?: boolean;
	placeholder?: EditablePlaceholder;
	maxLength?: number;
	name?: string;
	form?: string;
	helperText?: Child;
	errorText?: Child;
	translations?: EditableTranslations;
	onValueChange?: (details: { value: string }) => void;
	onValueCommit?: (details: { value: string }) => void;
	onValueRevert?: (details: { value: string }) => void;
	onEditChange?: (details: { edit: boolean }) => void;
	/** Driven by the interactive island; ignored when set by hand. */
	onEdit?: () => void;
	/** Driven by the interactive island; ignored when set by hand. */
	onCancel?: (options?: { restoreFocus?: boolean }) => void;
	/** Driven by the interactive island; ignored when set by hand. */
	onSubmit?: (options?: { restoreFocus?: boolean }) => void;
	/** Driven by the interactive island; ignored when set by hand. */
	onSetValue?: (value: string) => void;
	rootRef?: unknown;
	[key: string]: unknown;
}

export function Root(props: RootProps) {
	const [variantProps, localProps] = editable.splitVariantProps(props);
	const {
		children,
		class: classProp,
		id: idProp,
		value: valueProp,
		defaultValue,
		edit: editProp,
		defaultEdit,
		activationMode = "focus",
		submitMode = "both",
		selectOnFocus = true,
		autoResize,
		rows,
		items,
		disabled,
		readOnly,
		required,
		invalid,
		placeholder,
		maxLength,
		name,
		form,
		helperText,
		errorText,
		translations,
		onEdit,
		onCancel,
		onSubmit,
		onSetValue,
		rootRef,
		// Consumed only by the interactive island — dropped here so they never
		// leak onto the root `<div>` as unknown DOM attributes.
		onValueChange: _onValueChange,
		onValueCommit: _onValueCommit,
		onValueRevert: _onValueRevert,
		onEditChange: _onEditChange,
		...rest
	} = localProps;

	const styles = editable(variantProps);
	const autoId = useId();
	const id = idProp || autoId;
	const value = valueProp ?? defaultValue ?? "";
	const editing = editProp ?? defaultEdit ?? false;
	const empty = value.trim() === "";
	const placeholderText =
		typeof placeholder === "string"
			? { edit: placeholder, preview: placeholder }
			: placeholder;
	const isCombobox = variantProps.combobox as boolean | undefined;
	// Combobox mode stores the item's `value` (e.g. a slug) but previews its
	// human `label` — falls back to the raw value if it's not in `items`
	// (e.g. stale data pointing at a deleted option).
	const valueText = empty
		? (placeholderText?.preview ?? "")
		: isCombobox
			? (items?.find((item) => item.value === value)?.label ?? value)
			: value;

	const contextValue: EditableContextValue = {
		value,
		editing,
		empty,
		valueText,
		disabled,
		readOnly,
		invalid,
		required,
		autoResize,
		multiline: variantProps.multiline as boolean | undefined,
		rows,
		combobox: isCombobox,
		items,
		tags: variantProps.tags as boolean | undefined,
		activationMode,
		submitMode,
		selectOnFocus,
		placeholder: placeholderText,
		translations: { ...defaultTranslations, ...translations },
		maxLength,
		name,
		form,
		hasHelperText: !!helperText,
		hasErrorText: !!errorText,
		styles,
		ids: {
			area: `editable::${id}::area`,
			label: `editable::${id}::label`,
			preview: `editable::${id}::preview`,
			input: `editable::${id}::input`,
			editTrigger: `editable::${id}::edit-trigger`,
			submitTrigger: `editable::${id}::submit-trigger`,
			cancelTrigger: `editable::${id}::cancel-trigger`,
			control: `editable::${id}::control`,
			helperText: `editable::${id}::helper-text`,
			errorText: `editable::${id}::error-text`,
		},
		edit: onEdit ?? (() => {}),
		cancel: onCancel ?? (() => {}),
		submit: onSubmit ?? (() => {}),
		setValue: onSetValue ?? (() => {}),
	};

	return (
		<EditableContext.Provider value={contextValue}>
			<div
				ref={rootRef as never}
				id={id}
				class={cx(styles.root, classProp)}
				data-scope="editable"
				data-part="root"
				data-disabled={disabled ? "" : undefined}
				{...rest}
			>
				{children}
			</div>
		</EditableContext.Provider>
	);
}

export function RootProvider(props: RootProps) {
	return <Root {...props} />;
}

export interface AreaProps extends PropsWithChildren {
	class?: string;
	[key: string]: unknown;
}

export function Area(props: AreaProps) {
	const { children, class: classProp, ...rest } = props;
	const context = useEditableContext();
	const styles = context?.styles ?? editable();
	return (
		<div
			id={context?.ids.area}
			class={cx(styles.area, classProp)}
			data-scope="editable"
			data-part="area"
			data-focus={context?.editing ? "" : undefined}
			data-disabled={context?.disabled ? "" : undefined}
			data-placeholder-shown={context?.empty ? "" : undefined}
			style={context?.autoResize ? { display: "inline-grid" } : undefined}
			{...rest}
		>
			{children}
		</div>
	);
}

export interface LabelProps extends PropsWithChildren {
	class?: string;
	[key: string]: unknown;
}

export function Label(props: LabelProps) {
	const { children, class: classProp, ...rest } = props;
	const context = useEditableContext();
	const styles = context?.styles ?? editable();
	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: a <label> has no tabIndex and isn't independently keyboard-reachable; this onClick only mirrors the browser's own native label-click-focuses-control behavior
		<label
			id={context?.ids.label}
			for={context?.ids.input}
			class={cx(styles.label, classProp)}
			data-scope="editable"
			data-part="label"
			data-focus={context?.editing ? "" : undefined}
			data-invalid={context?.invalid ? "" : undefined}
			data-required={context?.required ? "" : undefined}
			onClick={() => {
				if (context?.editing) return;
				document.getElementById(context?.ids.preview ?? "")?.focus({
					preventScroll: true,
				});
			}}
			{...rest}
		>
			{children}
		</label>
	);
}

export interface PreviewProps {
	class?: string;
	/** Renders this HTML instead of the plain-text value — e.g. a task
	 * description rendered as formatted markdown. The caller is responsible
	 * for trusting/sanitizing the source; a click on a link inside still
	 * navigates instead of entering edit mode, since focus (which drives
	 * `activationMode: "focus"`) lands on the link, not this wrapper. */
	dangerouslySetInnerHTML?: { __html: string };
	children?: Child;
	[key: string]: unknown;
}

export function Preview(props: PreviewProps) {
	const {
		class: classProp,
		dangerouslySetInnerHTML,
		children,
		...rest
	} = props;
	const context = useEditableContext();
	const styles = context?.styles ?? editable();
	const interactive = !(context?.disabled || context?.readOnly);
	const spanProps = {
		id: context?.ids.preview,
		role: "button" as const,
		class: cx(styles.preview, classProp),
		"data-scope": "editable",
		"data-part": "preview",
		"data-placeholder-shown": context?.empty ? "" : undefined,
		"data-readonly": context?.readOnly ? "" : undefined,
		"data-disabled": context?.disabled ? "" : undefined,
		"aria-disabled": context?.disabled ? "true" : undefined,
		"aria-invalid": context?.invalid ? "true" : undefined,
		"data-invalid": context?.invalid ? "" : undefined,
		"data-autoresize": context?.autoResize ? "" : undefined,
		"aria-label": context?.translations.edit,
		hidden: context?.autoResize ? undefined : context?.editing,
		tabIndex: interactive ? 0 : undefined,
		onClick: () => {
			if (context?.activationMode === "click") context?.edit();
		},
		onFocus: () => {
			if (context?.activationMode === "focus") context?.edit();
		},
		onDoubleClick: () => {
			if (context?.activationMode === "dblclick") context?.edit();
		},
		onKeyDown: (e: KeyboardEvent) => {
			if (
				(e.key === "Enter" || e.key === " ") &&
				(context?.activationMode === "click" ||
					context?.activationMode === "dblclick")
			) {
				e.preventDefault();
				context?.edit();
			}
		},
		style: context?.autoResize
			? {
					whiteSpace: "pre",
					gridArea: "1 / 1 / auto / auto",
					visibility: context.editing ? "hidden" : undefined,
					overflow: "hidden",
					textOverflow: "ellipsis",
					minWidth: context.empty ? "3ch" : "0",
				}
			: undefined,
		...rest,
	};
	// The two branches must be genuinely separate elements (not one `<span>`
	// conditionally fed `dangerouslySetInnerHTML` vs. `children`) — hono/jsx's
	// JSX runtime builds a `children` array from the `{...}` expression even
	// when its value is `undefined`, so passing both props on the same call
	// always trips its "only one of children or dangerouslySetInnerHTML"
	// guard.
	if (dangerouslySetInnerHTML) {
		return (
			<span {...spanProps} dangerouslySetInnerHTML={dangerouslySetInnerHTML} />
		);
	}
	return (
		<span {...spanProps}>
			{children !== undefined
				? children
				: context?.tags
					? parseTags(context.value).map((tag) => (
							<span key={tag} class={styles.tag}>
								{tag}
							</span>
						))
					: context?.valueText}
		</span>
	);
}

export interface InputProps {
	class?: string;
	[key: string]: unknown;
}

export function Input(props: InputProps) {
	const { class: classProp, onKeyDown, ...rest } = props;
	const context = useEditableContext();
	const styles = context?.styles ?? editable();
	const editing = context?.editing ?? false;
	const autoResize = context?.autoResize;
	const multiline = context?.multiline;

	// Selecting an option *is* the commit — there's no separate typed draft to
	// submit afterward, unlike free text.
	if (context?.combobox) {
		return (
			<div
				hidden={!editing}
				class={cx(css({ width: "full" }), classProp)}
				data-scope="editable"
				data-part="combobox-input"
			>
				<InteractiveCombobox
					items={context.items ?? []}
					value={context.value}
					onValueChange={(next: string) => {
						context.setValue(next);
						context.submit({ restoreFocus: true });
					}}
					placeholder={context.placeholder?.edit}
					allowClear
				/>
			</div>
		);
	}

	if (context?.tags) {
		return <EditableTagsInput class={classProp} />;
	}
	const describedBy = [
		context?.hasHelperText ? context.ids.helperText : null,
		context?.invalid && context?.hasErrorText ? context.ids.errorText : null,
	]
		.filter(Boolean)
		.join(" ");
	const submitOnEnter =
		context?.submitMode === "enter" || context?.submitMode === "both";
	const submitOnBlur =
		context?.submitMode === "blur" || context?.submitMode === "both";

	const handleChange = (e: Event) => {
		context?.setValue(
			(e.currentTarget as HTMLInputElement | HTMLTextAreaElement).value,
		);
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		const isSubmitCombo =
			(e as unknown as { metaKey?: boolean }).metaKey || e.ctrlKey;
		if (e.key === "Escape") {
			context?.cancel({ restoreFocus: true });
			e.preventDefault();
		} else if (
			e.key === "Enter" &&
			// A plain Enter inserts a newline in a `<textarea>` instead of
			// submitting — only the Cmd/Ctrl+Enter combo commits multiline text.
			(multiline
				? isSubmitCombo
				: submitOnEnter && !e.shiftKey && !isSubmitCombo)
		) {
			context?.submit({ restoreFocus: true });
			e.preventDefault();
		}
		(onKeyDown as ((e: typeof e) => void) | undefined)?.(e);
	};

	const handleBlur = (e: FocusEvent) => {
		if (!submitOnBlur) return;
		const next = e.relatedTarget as HTMLElement | null;
		if (
			next?.closest('[data-part="submit-trigger"]') ||
			next?.closest('[data-part="cancel-trigger"]')
		) {
			return;
		}
		context?.submit({ restoreFocus: false });
	};

	const sharedProps = {
		id: context?.ids.input,
		name: context?.name,
		form: context?.form,
		"aria-label": context?.translations.input,
		class: cx(styles.input, classProp),
		"data-scope": "editable",
		"data-part": "input",
		hidden: autoResize ? undefined : !editing,
		placeholder: context?.placeholder?.edit,
		maxLength: context?.maxLength,
		required: context?.required,
		disabled: context?.disabled,
		"data-disabled": context?.disabled ? "" : undefined,
		readOnly: context?.readOnly,
		"data-readonly": context?.readOnly ? "" : undefined,
		"aria-invalid": context?.invalid ? "true" : undefined,
		"aria-describedby": describedBy || undefined,
		"data-invalid": context?.invalid ? "" : undefined,
		"data-autoresize": autoResize ? "" : undefined,
		// Controlled `value` (not `defaultValue`) — hono/jsx's SSR renderer
		// serialises `defaultValue` as a dead attribute that never reaches the
		// live DOM property, so the field would render empty on first paint.
		value: context?.value ?? "",
		onChange: handleChange,
		onKeyDown: handleKeyDown,
		onBlur: handleBlur,
		...rest,
	};

	if (multiline) {
		return <textarea {...sharedProps} rows={context?.rows ?? 3} />;
	}

	return (
		<input
			{...sharedProps}
			type="text"
			size={autoResize ? 1 : undefined}
			style={
				autoResize
					? {
							gridArea: "1 / 1 / auto / auto",
							visibility: !editing ? "hidden" : undefined,
						}
					: undefined
			}
		/>
	);
}

/**
 * `tags` mode's editing widget: existing tags as removable chips plus a text
 * field that turns Enter/comma keystrokes into new chips. Deliberately a
 * self-contained mini implementation rather than reusing the standalone
 * `TagsField` component — that component's interactive logic lives directly
 * in its island file (unlike Combobox/Dropdown, whose logic already sits in
 * their -primitive.tsx so it's reusable without a nested-island boundary),
 * so pulling it in here would either duplicate it anyway or require first
 * refactoring TagsField itself.
 */
function EditableTagsInput(props: { class?: string }) {
	const context = useEditableContext();
	const styles = context?.styles ?? editable();
	const editing = context?.editing ?? false;
	const tags = parseTags(context?.value ?? "");
	const [draft, setDraft] = useState("");

	const commitTags = (next: string[]) => {
		context?.setValue(next.join(", "));
	};

	const addTag = (raw: string) => {
		const tag = raw.trim();
		setDraft("");
		if (!tag || tags.includes(tag)) return;
		commitTags([...tags, tag]);
	};

	const removeTag = (index: number) => {
		commitTags(tags.filter((_, i) => i !== index));
	};

	const submitOnBlur =
		context?.submitMode === "blur" || context?.submitMode === "both";

	return (
		<div
			hidden={!editing}
			class={cx(styles.input, styles.tagsInput, props.class)}
			data-scope="editable"
			data-part="tags-input"
		>
			{tags.map((tag, index) => (
				<span key={tag} class={styles.tag} data-part="tag">
					{tag}
					<button
						type="button"
						class={styles.tagDeleteTrigger}
						data-part="tag-delete-trigger"
						aria-label={`Remove ${tag}`}
						// Without this, the mousedown blurs the text input first
						// (default browser focus-shift behavior), which fires the
						// input's blur-submit handler — closing the editor and
						// discarding this click's `removeTag` before it can run.
						onMouseDown={(e) => e.preventDefault()}
						onClick={() => removeTag(index)}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
						>
							<title>Remove</title>
							<path d="M18 6 6 18M6 6l12 12" />
						</svg>
					</button>
				</span>
			))}
			<input
				id={context?.ids.input}
				data-scope="editable"
				data-part="input"
				class={styles.tagsInputField}
				value={draft}
				placeholder={tags.length === 0 ? context?.placeholder?.edit : ""}
				aria-label={context?.translations.input}
				onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === ",") {
						e.preventDefault();
						addTag(draft);
					} else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
						removeTag(tags.length - 1);
					} else if (e.key === "Escape") {
						context?.cancel({ restoreFocus: true });
					}
				}}
				onBlur={(e) => {
					if (draft.trim()) addTag(draft);
					if (!submitOnBlur) return;
					const next = (e as FocusEvent).relatedTarget as HTMLElement | null;
					if (
						next?.closest('[data-part="submit-trigger"]') ||
						next?.closest('[data-part="cancel-trigger"]')
					) {
						return;
					}
					context?.submit({ restoreFocus: false });
				}}
			/>
		</div>
	);
}

export interface ControlProps extends PropsWithChildren {
	class?: string;
	[key: string]: unknown;
}

export function Control(props: ControlProps) {
	const { children, class: classProp, ...rest } = props;
	const context = useEditableContext();
	const styles = context?.styles ?? editable();
	return (
		<div
			id={context?.ids.control}
			class={cx(styles.control, classProp)}
			data-scope="editable"
			data-part="control"
			{...rest}
		>
			{children}
		</div>
	);
}

export interface EditTriggerProps extends PropsWithChildren {
	class?: string;
	[key: string]: unknown;
}

export function EditTrigger(props: EditTriggerProps) {
	const { children, class: classProp, ...rest } = props;
	const context = useEditableContext();
	const styles = context?.styles ?? editable();
	const triggerProps = {
		type: "button" as const,
		id: context?.ids.editTrigger,
		"data-scope": "editable",
		"data-part": "edit-trigger",
		"aria-label": context?.translations.edit,
		hidden: context?.editing,
		disabled: context?.disabled,
		onClick: () => context?.edit(),
		...rest,
	};
	return (
		<button class={cx(styles.editTrigger, classProp)} {...triggerProps}>
			{children}
		</button>
	);
}

export interface SubmitTriggerProps extends PropsWithChildren {
	class?: string;
	[key: string]: unknown;
}

export function SubmitTrigger(props: SubmitTriggerProps) {
	const { children, class: classProp, ...rest } = props;
	const context = useEditableContext();
	const styles = context?.styles ?? editable();
	const triggerProps = {
		type: "button" as const,
		id: context?.ids.submitTrigger,
		"data-scope": "editable",
		"data-part": "submit-trigger",
		"aria-label": context?.translations.submit,
		hidden: !context?.editing,
		disabled: context?.disabled,
		onClick: () => context?.submit({ restoreFocus: true }),
		...rest,
	};
	return (
		<button class={cx(styles.submitTrigger, classProp)} {...triggerProps}>
			{children}
		</button>
	);
}

export interface CancelTriggerProps extends PropsWithChildren {
	class?: string;
	[key: string]: unknown;
}

export function CancelTrigger(props: CancelTriggerProps) {
	const { children, class: classProp, ...rest } = props;
	const context = useEditableContext();
	const styles = context?.styles ?? editable();
	const triggerProps = {
		type: "button" as const,
		id: context?.ids.cancelTrigger,
		"data-scope": "editable",
		"data-part": "cancel-trigger",
		"aria-label": context?.translations.cancel,
		hidden: !context?.editing,
		disabled: context?.disabled,
		onClick: () => context?.cancel({ restoreFocus: true }),
		...rest,
	};
	return (
		<button class={cx(styles.cancelTrigger, classProp)} {...triggerProps}>
			{children}
		</button>
	);
}

export function Context(props: {
	children: (context: EditableContextValue | null) => Child;
}) {
	const context = useEditableContext();
	return props.children(context);
}

const DefaultEditIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<title>Edit</title>
		<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
	</svg>
);

const DefaultSubmitIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<title>Save</title>
		<path d="M20 6 9 17l-5-5" />
	</svg>
);

const DefaultCancelIcon = () => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<title>Cancel</title>
		<path d="M18 6 6 18M6 6l12 12" />
	</svg>
);

export function HelperText(props: { children?: Child; class?: string }) {
	const { children, class: classProp } = props;
	const context = useEditableContext();
	const styles = context?.styles ?? editable();
	return (
		<div
			id={context?.ids.helperText}
			class={cx(styles.helperText, classProp)}
			data-scope="editable"
			data-part="helper-text"
		>
			{children}
		</div>
	);
}

export function ErrorText(props: { children?: Child; class?: string }) {
	const { children, class: classProp } = props;
	const context = useEditableContext();
	const styles = context?.styles ?? editable();
	if (!children || !context?.invalid) return null;
	return (
		<div
			id={context?.ids.errorText}
			class={cx(styles.errorText, classProp)}
			data-scope="editable"
			data-part="error-text"
		>
			{children}
		</div>
	);
}

export interface ContentProps extends PropsWithChildren {
	label?: JSX.Element | string;
	helperText?: Child;
	errorText?: Child;
}

/**
 * Renders the label, preview/input area, and edit/submit/cancel controls for
 * the default (non-compound) `<Editable>` API.
 *
 * Lives in the primitive — rather than being built once by the smart wrapper
 * and threaded through as the interactive island's `children` — because
 * HonoX rebuilds an island's `children` from a serialised HTML snapshot on
 * hydration instead of by re-invoking JSX, and reconciling that reconstructed
 * tree against a freshly re-rendered one on a later state update overflows
 * hono/jsx's diff (`RangeError: Maximum call stack size exceeded`). Calling
 * `Content` from inside the island's own render (see islands/editable.tsx)
 * produces an ordinary vnode tree each render instead, side-stepping this.
 */
export function Content(props: ContentProps) {
	return (
		<>
			{props.label && <Label>{props.label}</Label>}
			<Area>
				<Preview />
				<Input />
			</Area>
			<Control>
				<EditTrigger>
					<DefaultEditIcon />
				</EditTrigger>
				<SubmitTrigger>
					<DefaultSubmitIcon />
				</SubmitTrigger>
				<CancelTrigger>
					<DefaultCancelIcon />
				</CancelTrigger>
			</Control>
			{props.helperText && <HelperText>{props.helperText}</HelperText>}
			<ErrorText>{props.errorText}</ErrorText>
			{props.children}
		</>
	);
}

export type { EditableStyles };
