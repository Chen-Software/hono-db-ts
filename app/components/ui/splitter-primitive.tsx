import { cx } from "design-system/css";
import { type SplitterVariantProps, splitter } from "design-system/recipes";
import type { PropsWithChildren } from "hono/jsx";
import {
	createContext,
	useContext,
	useEffect,
	useId,
	useRef,
	useState,
} from "hono/jsx";

type SplitterStyles = ReturnType<typeof splitter>;

interface SplitterContextValue {
	styles: SplitterStyles;
	orientation: "horizontal" | "vertical";
	panelSizes?: Record<string | number, number>;
}

const SplitterContext = createContext<SplitterContextValue | null>(null);

export const useSplitterContext = () => {
	const context = useContext(SplitterContext);
	if (!context) {
		if (typeof window === "undefined") {
			return {
				styles: splitter({}),
				orientation: "horizontal",
			} as SplitterContextValue;
		}
		throw new Error("useSplitterContext must be used within a Splitter.Root");
	}
	return context;
};

export interface RootProps extends SplitterVariantProps, PropsWithChildren {
	id?: string;
	orientation?: "horizontal" | "vertical";
	class?: string;
	style?: Record<string, string | number>;
	rootRef?: any;
	panelSizes?: Record<string | number, number>;
}

export function Root(props: RootProps) {
	const [variantProps, localProps] = splitter.splitVariantProps(props);
	const {
		children,
		id: idProp,
		orientation = "horizontal",
		class: classProp,
		style,
		rootRef,
		panelSizes,
		...rest
	} = localProps;

	const styles = splitter(variantProps);
	const fallbackId = useId();
	const id = idProp || fallbackId;

	const contextValue: SplitterContextValue = {
		styles,
		orientation,
		panelSizes,
	};

	return (
		<SplitterContext.Provider value={contextValue}>
			<div
				id={id}
				ref={rootRef}
				class={cx(styles.root, classProp)}
				style={style}
				data-orientation={orientation}
				data-scope="splitter"
				data-part="root"
				{...rest}
			>
				{children}
			</div>
		</SplitterContext.Provider>
	);
}

export interface PanelProps extends PropsWithChildren {
	id: string | number;
	class?: string;
	style?: Record<string, string | number>;
}

export function Panel(props: PanelProps) {
	const { id, children, class: classProp, style, ...rest } = props;
	const context = useSplitterContext();

	const size = context.panelSizes?.[id];
	const panelStyle = {
		...style,
		flex: size !== undefined ? `${size} 1 0%` : undefined,
	};

	return (
		<div
			id={id.toString()}
			data-scope="splitter"
			data-part="panel"
			data-id={id}
			class={cx(context.styles.panel, classProp)}
			style={panelStyle}
			{...rest}
		>
			{children}
		</div>
	);
}

export interface ResizeTriggerProps extends PropsWithChildren {
	id: string;
	disabled?: boolean;
	class?: string;
	style?: Record<string, string | number>;
}

export function ResizeTrigger(props: ResizeTriggerProps) {
	const { id, disabled, children, class: classProp, style, ...rest } = props;
	const context = useSplitterContext();

	return (
		<button
			type="button"
			id={id}
			data-scope="splitter"
			data-part="resize-trigger"
			data-id={id}
			data-orientation={context.orientation}
			data-disabled={disabled ? "" : undefined}
			disabled={disabled}
			class={cx(context.styles.resizeTrigger, classProp)}
			style={style}
			{...rest}
		>
			{children || (
				<div
					data-part="resize-trigger-indicator"
					class={context.styles.resizeTriggerIndicator}
				/>
			)}
		</button>
	);
}

export interface InteractiveSplitterProps extends RootProps {
	panels: { id: string | number; content: any; class?: string; style?: any }[];
	defaultSize?: { id: string | number; size: number }[];
	size?: { id: string | number; size: number }[];
	onSizeChange?: (sizes: { id: string | number; size: number }[]) => void;
	resizeTriggerClass?: string;
}

export function InteractiveSplitter(props: InteractiveSplitterProps) {
	const {
		id: idProp,
		orientation = "horizontal",
		panels,
		defaultSize,
		size: sizeProp,
		onSizeChange,
		resizeTriggerClass,
		...rootProps
	} = props;

	const fallbackId = useId();
	const rootId = idProp || `splitter-${fallbackId}`;

	const initialSizes =
		sizeProp ||
		defaultSize ||
		panels.map((p) => ({ id: p.id, size: 100 / panels.length }));
	const [sizes, setSizes] = useState(initialSizes);

	const sizesRef = useRef(sizes);
	const activeTriggerRef = useRef<string | null>(null);
	const startPosRef = useRef(0);
	const startSizesRef = useRef(sizes);

	useEffect(() => {
		sizesRef.current = sizes;
	}, [sizes]);

	useEffect(() => {
		if (sizeProp) {
			setSizes(sizeProp);
		}
	}, [sizeProp]);

	useEffect(() => {
		const root = document.getElementById(rootId);
		if (!root) return;

		root.setAttribute("data-hydrated", "true");

		const handleMouseMove = (e: MouseEvent | TouchEvent) => {
			if (!activeTriggerRef.current) return;

			const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
			const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
			const currentPos = orientation === "horizontal" ? clientX : clientY;

			const delta = currentPos - startPosRef.current;
			const rootRect = root.getBoundingClientRect();
			const totalSize =
				orientation === "horizontal" ? rootRect.width : rootRect.height;
			const deltaPercent = (delta / totalSize) * 100;

			const [id1, id2] = activeTriggerRef.current.split(":");

			const newSizes = [...startSizesRef.current];
			const idx1 = newSizes.findIndex((s) => s.id.toString() === id1);
			const idx2 = newSizes.findIndex((s) => s.id.toString() === id2);

			if (idx1 !== -1 && idx2 !== -1) {
				const s1 = startSizesRef.current[idx1].size + deltaPercent;
				const s2 = startSizesRef.current[idx2].size - deltaPercent;

				// Basic constraint: min 5%
				if (s1 > 5 && s2 > 5) {
					newSizes[idx1] = { ...newSizes[idx1], size: s1 };
					newSizes[idx2] = { ...newSizes[idx2], size: s2 };
					setSizes(newSizes);
					onSizeChange?.(newSizes);
				}
			}
		};

		const handleMouseUp = () => {
			activeTriggerRef.current = null;
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.removeEventListener("touchmove", handleMouseMove);
			document.removeEventListener("touchend", handleMouseUp);
		};

		const handleTriggerDown = (e: MouseEvent | TouchEvent) => {
			const trigger = (e.target as HTMLElement).closest(
				'[data-part="resize-trigger"]',
			);
			if (!trigger) return;

			const id = trigger.getAttribute("data-id");
			if (!id) return;

			activeTriggerRef.current = id;
			const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
			const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
			startPosRef.current = orientation === "horizontal" ? clientX : clientY;
			startSizesRef.current = sizesRef.current;

			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
			document.addEventListener("touchmove", handleMouseMove, {
				passive: false,
			});
			document.addEventListener("touchend", handleMouseUp);

			e.preventDefault();
		};

		root.addEventListener("mousedown", handleTriggerDown as any);
		root.addEventListener("touchstart", handleTriggerDown as any, {
			passive: false,
		});

		return () => {
			root.removeEventListener("mousedown", handleTriggerDown as any);
			root.removeEventListener("touchstart", handleTriggerDown as any);
			handleMouseUp();
		};
	}, [rootId, orientation, onSizeChange]);

	const panelSizesMap = Object.fromEntries(sizes.map((s) => [s.id, s.size]));

	return (
		<Root
			{...rootProps}
			id={rootId}
			orientation={orientation}
			panelSizes={panelSizesMap}
		>
			{panels.map((panel, index) => (
				<>
					<Panel
						key={panel.id}
						id={panel.id}
						class={panel.class}
						style={panel.style}
					>
						{panel.content}
					</Panel>
					{index < panels.length - 1 && (
						<ResizeTrigger
							key={`${panel.id}-${panels[index + 1].id}`}
							id={`${panel.id}:${panels[index + 1].id}`}
							class={resizeTriggerClass}
						/>
					)}
				</>
			))}
		</Root>
	);
}
