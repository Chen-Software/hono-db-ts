import { cx } from "design-system/css";
import {
	type CollapsibleVariantProps,
	collapsible,
} from "design-system/recipes";
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

type CollapsibleStyles = ReturnType<typeof collapsible>;

interface CollapsibleContextValue {
	styles: CollapsibleStyles;
	open: boolean;
	onOpenChange?: (details: { open: boolean }) => void;
	id: string;
}

const CollapsibleContext = createContext<CollapsibleContextValue | null>(null);

const useCollapsibleContext = () => {
	const context = useContext(CollapsibleContext);
	return context;
};

interface RootProps extends CollapsibleVariantProps, PropsWithChildren {
	open?: boolean;
	onOpenChange?: (details: { open: boolean }) => void;
	disabled?: boolean;
	id?: string;
	class?: string;
}

function Root(props: RootProps) {
	const [variantProps, localProps] = collapsible.splitVariantProps(props);
	const {
		children,
		open = false,
		onOpenChange,
		disabled,
		id: idProp,
		class: classProp,
		...restProps
	} = localProps;
	const styles = collapsible(variantProps);
	const generatedId = useId();
	const id = idProp || generatedId;

	const value = {
		styles,
		open,
		onOpenChange,
		id,
	};

	return (
		<CollapsibleContext.Provider value={value}>
			<div
				id={id}
				data-scope="collapsible"
				data-part="root"
				data-state={open ? "open" : "closed"}
				data-disabled={disabled ? "" : undefined}
				class={cx(styles.root, classProp)}
				{...restProps}
			>
				{children}
			</div>
		</CollapsibleContext.Provider>
	);
}

interface TriggerProps extends PropsWithChildren {
	class?: string;
	disabled?: boolean;
	asChild?: boolean;
}

function Trigger(props: TriggerProps) {
	const { children, class: classProp, disabled, asChild, ...restProps } = props;
	const context = useCollapsibleContext();
	const styles = context?.styles;
	const open = context?.open;
	const id = context?.id;

	const triggerProps = {
		"aria-expanded": open ? "true" : "false",
		"aria-controls": id ? `${id}-content` : undefined,
		"data-scope": "collapsible",
		"data-part": "trigger",
		"data-state": open ? "open" : "closed",
		"data-disabled": disabled ? "" : undefined,
		disabled: disabled,
		...restProps,
	};

	if (asChild && typeof children === "object" && children !== null) {
		const child = children as any;
		const childProps = child.props || {};
		return cloneElement(child, {
			...triggerProps,
			class: cx(
				styles?.trigger,
				classProp,
				childProps.class || childProps.className,
			),
		});
	}

	return (
		<button
			type="button"
			class={cx(styles?.trigger, classProp)}
			{...triggerProps}
		>
			{children}
		</button>
	);
}

interface ContentProps extends PropsWithChildren {
	class?: string;
}

function Content(props: ContentProps) {
	const { children, class: classProp, ...restProps } = props;
	const context = useCollapsibleContext();
	const styles = context?.styles;
	const open = context?.open;
	const id = context?.id;

	return (
		<div
			id={id ? `${id}-content` : undefined}
			data-scope="collapsible"
			data-part="content"
			data-state={open ? "open" : "closed"}
			class={cx(styles?.content, classProp)}
			{...restProps}
		>
			{children}
		</div>
	);
}

interface IndicatorProps extends PropsWithChildren {
	class?: string;
}

function Indicator(props: IndicatorProps) {
	const { children, class: classProp, ...restProps } = props;
	const context = useCollapsibleContext();
	const styles = context?.styles;
	const open = !!context?.open;

	return (
		<span
			data-scope="collapsible"
			data-part="indicator"
			data-state={open ? "open" : "closed"}
			class={cx(styles?.indicator, classProp)}
			{...restProps}
		>
			{children}
		</span>
	);
}

interface InteractiveRootProps extends RootProps {
	defaultOpen?: boolean;
}

function InteractiveRoot(props: InteractiveRootProps) {
	const {
		open: openProp,
		defaultOpen,
		onOpenChange: onOpenChangeProp,
		id: idProp,
		...rest
	} = props;
	const [isOpen, setIsOpen] = useState(openProp ?? defaultOpen ?? false);
	const isControlled = openProp !== undefined;
	const open = isControlled ? openProp : isOpen;

	const fallbackId = useId();
	const rootId = idProp || `collapsible-${fallbackId}`;

	const handleOpenChangeRef = useRef<(nextOpen: boolean) => void>(() => {});

	const handleOpenChange = (nextOpen: boolean) => {
		if (!isControlled) {
			setIsOpen(nextOpen);
		}
		onOpenChangeProp?.({ open: nextOpen });
	};

	// Store the handler in a ref
	useEffect(() => {
		handleOpenChangeRef.current = handleOpenChange;
	}, [isControlled, onOpenChangeProp]);

	// Sync initial DOM state to match component state (fixes hydration mismatch)
	useEffect(() => {
		const root = document.getElementById(rootId);
		if (!root) return;
		root.setAttribute("data-state", open ? "open" : "closed");
		const contentElements = Array.from(
			root.querySelectorAll<HTMLElement>('[data-part="content"]'),
		);
		contentElements.forEach((content) => {
			content.setAttribute("data-state", open ? "open" : "closed");
			if (open) {
				content.style.cssText =
					"display: block !important; visibility: visible !important;";
			} else {
				content.style.cssText =
					"display: none !important; visibility: hidden !important;";
			}
		});
		const triggers = Array.from(
			root.querySelectorAll<HTMLElement>('[data-part="trigger"]'),
		);
		triggers.forEach((t) => {
			t.setAttribute("data-state", open ? "open" : "closed");
			t.setAttribute("aria-expanded", open ? "true" : "false");
		});
		const indicators = Array.from(
			root.querySelectorAll<HTMLElement>('[data-part="indicator"]'),
		);
		indicators.forEach((i) => {
			i.setAttribute("data-state", open ? "open" : "closed");
		});
	}, [rootId, open]);

	useEffect(() => {
		const root = document.getElementById(rootId);
		if (!root) return;

		const handleClick = (e: Event) => {
			const target = (e.target as HTMLElement).closest(
				"[data-part]",
			) as HTMLElement;
			if (!target) return;
			const dataPart = target.getAttribute("data-part");

			if (dataPart !== "trigger") return;

			const currentOpen = root.getAttribute("data-state") === "open";
			const nextOpen = !currentOpen;
			handleOpenChangeRef.current?.(nextOpen);

			// Update attributes manually for immediate feedback and to trigger animations
			root.setAttribute("data-state", nextOpen ? "open" : "closed");
			const contentElements = Array.from(
				root.querySelectorAll<HTMLElement>('[data-part="content"]'),
			);
			contentElements.forEach((content) => {
				content.setAttribute("data-state", nextOpen ? "open" : "closed");
				// Also set display styles to ensure visibility
				if (nextOpen) {
					content.style.cssText =
						"display: block !important; visibility: visible !important;";
				} else {
					content.style.cssText =
						"display: none !important; visibility: hidden !important;";
				}
			});
			const triggers = Array.from(
				root.querySelectorAll<HTMLElement>('[data-part="trigger"]'),
			);
			triggers.forEach((t) => {
				t.setAttribute("data-state", nextOpen ? "open" : "closed");
				t.setAttribute("aria-expanded", nextOpen ? "true" : "false");
			});
			const indicators = Array.from(
				root.querySelectorAll<HTMLElement>('[data-part="indicator"]'),
			);
			indicators.forEach((i) => {
				i.setAttribute("data-state", nextOpen ? "open" : "closed");
			});
		};

		root.addEventListener("click", handleClick);

		return () => {
			root.removeEventListener("click", handleClick);
		};
	}, [rootId]);

	return (
		<Root
			{...rest}
			id={rootId}
			open={open}
			onOpenChange={(details) => {
				handleOpenChangeRef.current?.(details.open);
			}}
		/>
	);
}

export type {
	ContentProps,
	IndicatorProps,
	InteractiveRootProps,
	RootProps,
	TriggerProps,
};
export { Content, Indicator, InteractiveRoot, Root, Trigger };
