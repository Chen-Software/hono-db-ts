import { css, cx } from "design-system/css";
import type { DialogVariantProps } from "design-system/recipes";
import { dialog } from "design-system/recipes";
import type { PropsWithChildren } from "hono/jsx";
import {
	cloneElement,
	createContext,
	useContext,
	useEffect,
	useId,
	useRef,
	useState,
} from "hono/jsx";
import { hasPart, useOverlay, whenAnimationEnds } from "./overlay-a11y";

type DialogStyles = ReturnType<typeof dialog>;

interface DialogContextValue {
	styles: DialogStyles;
	open?: boolean;
	/** Mount flag. Separate from `open` (intent) so the exit animation can play:
	 *  `data-state` reflects intent, while `display: none` is deferred until the
	 *  element is actually unmounted. See InteractiveDialog + useOverlay. */
	mounted?: boolean;
	onOpenChange?: (open: boolean) => void;
	id: string;
	dialogRole?: "dialog" | "alertdialog";
}

const DialogContext = createContext<DialogContextValue | null>(null);

const useDialogContext = () => {
	const context = useContext(DialogContext);
	return context;
};

export interface RootProps extends DialogVariantProps, PropsWithChildren {
	open?: boolean;
	/** Mount flag (see DialogContextValue). Defaults to `open` for the
	 *  non-interactive Root so standalone usage keeps its old behavior. */
	mounted?: boolean;
	onOpenChange?: (open: boolean) => void;
	id?: string;
	rootRef?: any;
	dialogRole?: "dialog" | "alertdialog";
}

export function Root(props: RootProps) {
	const [variantProps, localProps] = dialog.splitVariantProps(props);
	const {
		children,
		open,
		mounted,
		onOpenChange,
		id: idProp,
		rootRef,
		dialogRole,
	} = localProps;
	const styles = dialog(variantProps);
	const generatedId = useId();
	const id = idProp || generatedId;

	const value = {
		styles,
		open,
		mounted,
		onOpenChange,
		id,
		dialogRole,
	};

	return (
		<div id={id} ref={rootRef} data-overlay-root>
			<DialogContext.Provider value={value}>{children}</DialogContext.Provider>
		</div>
	);
}

export interface TriggerProps extends PropsWithChildren {
	class?: string;
	asChild?: boolean;
}

export function Trigger(props: TriggerProps) {
	const { children, class: classProp, asChild, ...restProps } = props;
	const context = useDialogContext();
	const open = context?.open;

	const triggerProps = {
		"aria-haspopup": "dialog",
		"aria-expanded": open,
		"data-scope": "dialog",
		"data-part": "trigger",
		"data-state": open ? "open" : "closed",
		...restProps,
	};

	if (asChild && typeof children === "object" && children !== null) {
		const child = children as any;
		return cloneElement(child, {
			...triggerProps,
			class: cx(classProp, child.props?.class),
		});
	}

	return (
		<button type="button" {...triggerProps}>
			{children}
		</button>
	);
}

export interface BackdropProps extends PropsWithChildren {
	class?: string;
}

export function Backdrop(props: BackdropProps) {
	const { children, class: classProp, ...restProps } = props;
	const context = useDialogContext();
	const styles = context?.styles || dialog();
	const open = context?.open;
	const mounted = context?.mounted ?? open;
	return (
		<div
			class={cx(
				styles.backdrop,
				"dialog__backdrop",
				classProp,
				!mounted && css({ display: "none" }),
			)}
			data-state={open ? "open" : "closed"}
			data-scope="dialog"
			data-part="backdrop"
			{...restProps}
		>
			{children}
		</div>
	);
}

export interface PositionerProps extends PropsWithChildren {
	class?: string;
}

export function Positioner(props: PositionerProps) {
	const { children, class: classProp, ...restProps } = props;
	const context = useDialogContext();
	const styles = context?.styles || dialog();
	const open = context?.open;
	const mounted = context?.mounted ?? open;

	return (
		<div
			class={cx(
				styles.positioner,
				"dialog__positioner",
				classProp,
				!mounted && css({ display: "none" }),
			)}
			data-state={open ? "open" : "closed"}
			data-scope="dialog"
			data-part="positioner"
			{...restProps}
		>
			{children}
		</div>
	);
}

export interface ContentProps extends PropsWithChildren {
	class?: string;
	"aria-label"?: string;
}

export function Content(props: ContentProps) {
	const {
		children,
		class: classProp,
		"aria-label": ariaLabel,
		...restProps
	} = props;
	const context = useDialogContext();
	const styles = context?.styles || dialog();
	const open = context?.open;
	const mounted = context?.mounted ?? open;
	const id = context?.id;
	const role = context?.dialogRole ?? "dialog";

	const titleId = id ? `${id}-title` : undefined;
	const descriptionId = id ? `${id}-description` : undefined;

	// Accessible name resolution (WAI-ARIA):
	//  - explicit `aria-label` wins
	//  - else reference the visible Title via `aria-labelledby` (Title renders id `${id}-title`)
	//  - else fall back to a role-based default so screen readers always get *something*
	//    (this avoids pointing `aria-labelledby` at a non-existent element when `title` is omitted)
	//
	// Detection is by component TYPE reference (`hasPart(children, Title)`), not by a
	// `data-part` prop, because the `data-part="title"` marker is applied inside `Title`'s
	// render and is not present on the `<Title>` element's props at this point.
	const titleRendered = hasPart(children, Title);
	const hasDescription = hasPart(children, Description);
	const describedBy =
		descriptionId && hasDescription ? descriptionId : undefined;

	const nameProps = ariaLabel
		? { "aria-label": ariaLabel }
		: titleRendered
			? { "aria-labelledby": titleId }
			: { "aria-label": role === "alertdialog" ? "Alert" : "Dialog" };

	// Dev aid: a dialog must have an accessible name (WAI-ARIA). Warn client-side only.
	if (typeof window !== "undefined" && !ariaLabel && !titleRendered) {
		console.warn(
			"[Dialog] Missing accessible name: provide a `title` or `aria-label` so screen readers can identify the dialog.",
		);
	}

	return (
		<div
			role={role}
			data-scope="dialog"
			data-part="content"
			aria-modal="true"
			tabIndex={-1}
			{...nameProps}
			{...(describedBy ? { "aria-describedby": describedBy } : {})}
			class={cx(
				styles.content,
				"dialog__content",
				classProp,
				!mounted && css({ display: "none" }),
			)}
			data-state={open ? "open" : "closed"}
			{...restProps}
		>
			{children}
		</div>
	);
}

export interface HeaderProps extends PropsWithChildren {
	class?: string;
}

export function Header(props: HeaderProps) {
	const { children, class: classProp, ...restProps } = props;
	const context = useDialogContext();
	const styles = context?.styles || dialog();

	return (
		<div class={cx(styles.header, "dialog__header", classProp)} {...restProps}>
			{children}
		</div>
	);
}

export interface BodyProps extends PropsWithChildren {
	class?: string;
}

export function Body(props: BodyProps) {
	const { children, class: classProp, ...restProps } = props;
	const context = useDialogContext();
	const styles = context?.styles || dialog();

	return (
		<div class={cx(styles.body, "dialog__body", classProp)} {...restProps}>
			{children}
		</div>
	);
}

export interface FooterProps extends PropsWithChildren {
	class?: string;
}

export function Footer(props: FooterProps) {
	const { children, class: classProp, ...restProps } = props;
	const context = useDialogContext();
	const styles = context?.styles || dialog();

	return (
		<div class={cx(styles.footer, "dialog__footer", classProp)} {...restProps}>
			{children}
		</div>
	);
}

export interface TitleProps extends PropsWithChildren {
	class?: string;
}

export function Title(props: TitleProps) {
	const { children, class: classProp, ...restProps } = props;
	const context = useDialogContext();
	const styles = context?.styles || dialog();
	const id = context?.id;

	return (
		<h2
			id={id ? `${id}-title` : undefined}
			data-part="title"
			class={cx(styles.title, "dialog__title", classProp)}
			{...restProps}
		>
			{children}
		</h2>
	);
}

export interface DescriptionProps extends PropsWithChildren {
	class?: string;
}

export function Description(props: DescriptionProps) {
	const { children, class: classProp, ...restProps } = props;
	const context = useDialogContext();
	const styles = context?.styles || dialog();
	const id = context?.id;

	return (
		<div
			id={id ? `${id}-description` : undefined}
			data-part="description"
			class={cx(styles.description, "dialog__description", classProp)}
			{...restProps}
		>
			{children}
		</div>
	);
}

export interface CloseTriggerProps extends PropsWithChildren {
	class?: string;
	asChild?: boolean;
	unstyled?: boolean;
}

export function CloseTrigger(props: CloseTriggerProps) {
	const { children, class: classProp, asChild, unstyled, ...restProps } = props;
	const context = useDialogContext();
	const styles = context?.styles || dialog();

	const triggerProps = {
		"data-scope": "dialog",
		"data-part": "close-trigger",
		...restProps,
	};

	if (asChild && typeof children === "object" && children !== null) {
		const child = children as any;
		return cloneElement(child, {
			...triggerProps,
			class: cx(
				!unstyled && styles.closeTrigger,
				!unstyled && "dialog__closeTrigger",
				classProp,
				child.props?.class,
			),
		});
	}

	return (
		<button
			type="button"
			aria-label="Close"
			class={cx(
				!unstyled && styles.closeTrigger,
				!unstyled && "dialog__closeTrigger",
				classProp,
			)}
			{...triggerProps}
		>
			{children}
		</button>
	);
}

export interface ActionTriggerProps extends PropsWithChildren {
	class?: string;
	asChild?: boolean;
}

export function ActionTrigger(props: ActionTriggerProps) {
	const { children, class: classProp, asChild, ...restProps } = props;

	const triggerProps = {
		"data-scope": "dialog",
		"data-part": "action-trigger",
		...restProps,
	};

	if (asChild && typeof children === "object" && children !== null) {
		const child = children as any;
		return cloneElement(child, {
			...triggerProps,
			class: cx(classProp, child.props?.class),
		});
	}

	return (
		<button type="button" class={cx(classProp)} {...triggerProps}>
			{children}
		</button>
	);
}

// Interactive version with state management and full a11y behavior
// (focus trap, Escape, inert background, scroll lock, focus return).
// The behavior layer itself lives in `./overlay-a11y` (`useOverlay`) and is
// shared with Drawer so nested overlays cooperate on `inert` and focus.

export interface InteractiveDialogProps extends RootProps {
	defaultOpen?: boolean;
	/** Close when Escape is pressed. Default: true. */
	closeOnEscape?: boolean;
	/** Close when the backdrop is clicked / interaction occurs outside. Default: true. */
	closeOnInteractOutside?: boolean;
	/** Lock body scroll while open. Default: true. */
	preventScroll?: boolean;
	/** Trap Tab/Shift+Tab focus cycling within the content. Default: true. */
	trapFocus?: boolean;
	/** Element to focus when the dialog opens. Defaults to the first focusable. */
	initialFocusEl?: () => HTMLElement | null;
	/** Element to focus when the dialog closes. Defaults to the trigger. */
	finalFocusEl?: () => HTMLElement | null;
	/** Fired on Escape keydown, before the close-on-escape default runs. Call `event.preventDefault()` to suppress the default close. */
	onEscapeKeyDown?: (event: KeyboardEvent) => void;
	/** Fired on an outside backdrop interaction, before the close-on-interact-outside default runs. Call `event.preventDefault()` to suppress the default close. */
	onInteractOutside?: (event: Event) => void;
	/** Fired once the close (exit) animation has fully finished. */
	onExitComplete?: () => void;
}

export function InteractiveDialog(props: InteractiveDialogProps) {
	const {
		open: openProp,
		onOpenChange: onOpenChangeProp,
		defaultOpen,
		id: idProp,
		dialogRole,
		closeOnEscape = true,
		closeOnInteractOutside = true,
		preventScroll = true,
		trapFocus = true,
		initialFocusEl,
		finalFocusEl,
		onEscapeKeyDown,
		onInteractOutside,
		onExitComplete,
		...rest
	} = props;
	const [isOpen, setIsOpen] = useState(openProp ?? defaultOpen ?? false);

	const isControlled = openProp !== undefined;
	const open = isControlled ? openProp : isOpen;

	const fallbackId = useId();
	const rootId = idProp || `dialog-${fallbackId}`;
	const rootRef = useRef<HTMLElement>(null);

	const [renderOpen, setRenderOpen] = useState(open);

	useEffect(() => {
		if (open) {
			setRenderOpen(true);
		} else {
			const root = rootRef.current;
			if (root && renderOpen) {
				const contentEl = root.querySelector(
					'[data-part="content"]',
				) as HTMLElement | null;
				const backdropEl = root.querySelector(
					'[data-part="backdrop"]',
				) as HTMLElement | null;
				const animatedEl = contentEl || backdropEl;
				if (animatedEl) {
					const cleanup = whenAnimationEnds(animatedEl, () => {
						setRenderOpen(false);
					});
					return cleanup;
				}
			}
			setRenderOpen(false);
		}
	}, [open, renderOpen]);

	const handleOpenChange = (nextOpen: boolean) => {
		if (!isControlled) {
			setIsOpen(nextOpen);
		}
		onOpenChangeProp?.(nextOpen);
	};

	// Click delegation + focus trap / Escape / inert / scroll lock / focus return.
	useOverlay({
		rootRef,
		open,
		closeOnEscape,
		closeOnInteractOutside,
		preventScroll,
		trapFocus,
		onChange: handleOpenChange,
		initialFocusEl,
		finalFocusEl,
		onEscapeKeyDown,
		onInteractOutside,
		onExitComplete,
	});

	return (
		<Root
			{...rest}
			id={rootId}
			open={open}
			mounted={renderOpen}
			onOpenChange={handleOpenChange}
			rootRef={rootRef}
			dialogRole={dialogRole}
		/>
	);
}
