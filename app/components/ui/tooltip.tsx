import { useId } from "hono/jsx";
import TooltipIsland from "../../islands/tooltip";
import { shouldHydrate } from "./island-utils";
import {
	TooltipArrow,
	TooltipArrowTip,
	TooltipBase,
	type TooltipBaseProps,
	TooltipContent,
	type TooltipPlacement,
	TooltipPositioner,
	TooltipRoot,
	TooltipTrigger,
} from "./tooltip-primitive";

type TooltipPartsProps = Pick<
	TooltipBaseProps,
	| "children"
	| "content"
	| "showArrow"
	| "triggerProps"
	| "contentProps"
	| "asChild"
> & { id: string; placement?: TooltipPlacement };

/**
 * Builds the Trigger + Positioner + Content (+ Arrow) tree. Must only ever
 * be invoked outside an island (i.e. here, never inside
 * `InteractiveTooltip`) — see the doc comment on `InteractiveTooltip` in
 * tooltip-primitive.tsx for why `asChild`'s `cloneElement` call can't safely
 * re-run on the client.
 *
 * `id` and `placement` are passed explicitly (instead of letting parts
 * derive them from `TooltipContext`) because HonoX reconstructs an island's
 * `children` for hydration from a `<template>` snapshot rendered *without*
 * that context — context-derived values would silently reset to their
 * fallback default once the client hydrates, while explicit props survive.
 */
function TooltipParts(props: TooltipPartsProps) {
	const {
		id,
		placement,
		children,
		content,
		showArrow,
		triggerProps,
		contentProps,
		asChild,
	} = props;

	return (
		<>
			<TooltipTrigger
				id={`tooltip-trigger-${id}`}
				aria-describedby={`tooltip-content-${id}`}
				asChild={asChild}
				tabIndex={0}
				{...triggerProps}
			>
				{children}
			</TooltipTrigger>
			<TooltipPositioner placement={placement}>
				<TooltipContent id={`tooltip-content-${id}`} {...contentProps}>
					{showArrow && (
						<TooltipArrow placement={placement}>
							<TooltipArrowTip placement={placement} />
						</TooltipArrow>
					)}
					{content}
				</TooltipContent>
			</TooltipPositioner>
		</>
	);
}

export interface TooltipProps extends TooltipBaseProps {
	/**
	 * Whether the tooltip should be interactive (hydrated as an island).
	 * Defaults to true if not explicitly set to false.
	 */
	interactive?: boolean;
}

/**
 * A high-level Tooltip component for common use cases.
 */
function Tooltip(props: TooltipProps) {
	const { interactive, ...rest } = props;
	const autoId = useId();

	if (rest.disabled) return rest.children;

	if (shouldHydrate(interactive, true)) {
		const {
			id,
			open,
			defaultOpen,
			onOpenChange,
			placement,
			closeOnEscape,
			openDelay,
			closeDelay,
			children,
			content,
			showArrow,
			triggerProps,
			contentProps,
			asChild,
		} = rest;
		const resolvedId = id || autoId;

		return (
			<TooltipIsland
				id={resolvedId}
				open={open}
				defaultOpen={defaultOpen}
				onOpenChange={onOpenChange}
				placement={placement}
				closeOnEscape={closeOnEscape}
				openDelay={openDelay}
				closeDelay={closeDelay}
			>
				<TooltipParts
					id={resolvedId}
					placement={placement}
					content={content}
					showArrow={showArrow}
					triggerProps={triggerProps}
					contentProps={contentProps}
					asChild={asChild}
				>
					{children}
				</TooltipParts>
			</TooltipIsland>
		);
	}

	return <TooltipBase {...rest} />;
}

const TooltipComponent = Object.assign(Tooltip, {
	Root: TooltipRoot,
	Trigger: TooltipTrigger,
	Positioner: TooltipPositioner,
	Content: TooltipContent,
	Arrow: TooltipArrow,
	ArrowTip: TooltipArrowTip,
});

export {
	TooltipArrow as Arrow,
	TooltipArrowTip as ArrowTip,
	TooltipComponent as Tooltip,
	TooltipContent as Content,
	TooltipPositioner as Positioner,
	TooltipRoot as Root,
	TooltipTrigger as Trigger,
};

export default TooltipComponent;
