import { cx } from "design-system/css";
import type { ProgressVariantProps } from "design-system/recipes/index.mjs";
import { progress } from "design-system/recipes/index.mjs";
import type { PropsWithChildren } from "hono/jsx";
import { createContext, useContext } from "hono/jsx";

type ProgressStyles = ReturnType<typeof progress>;

interface ProgressContextValue {
	styles: ProgressStyles;
	value: number | null;
	min: number;
	max: number;
	orientation: "horizontal" | "vertical";
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

const useProgressContext = () => {
	const context = useContext(ProgressContext);
	if (!context) {
		throw new Error(
			"useProgressContext must be used within a ProgressProvider",
		);
	}
	return context;
};

export interface RootProps extends ProgressVariantProps, PropsWithChildren {
	value?: number | null;
	min?: number;
	max?: number;
	orientation?: "horizontal" | "vertical";
	class?: string;
	id?: string;
}

export function Root(props: RootProps) {
	const [variantProps, localProps] = progress.splitVariantProps(props);
	const {
		children,
		value = null,
		min = 0,
		max = 100,
		orientation = "horizontal",
		class: classProp,
		...restProps
	} = localProps;

	const styles = progress(variantProps);

	const contextValue: ProgressContextValue = {
		styles,
		value,
		min,
		max,
		orientation,
	};

	const state =
		value === null ? "indeterminate" : value >= max ? "complete" : "loading";

	return (
		<ProgressContext.Provider value={contextValue}>
			<div
				role="progressbar"
				aria-valuemin={min}
				aria-valuemax={max}
				aria-valuenow={value === null ? undefined : value}
				data-scope="progress"
				data-part="root"
				data-state={state}
				data-orientation={orientation}
				class={cx(styles.root, classProp)}
				{...restProps}
			>
				{children}
			</div>
		</ProgressContext.Provider>
	);
}

export function Label(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const { styles, value, max } = useProgressContext();
	const state =
		value === null ? "indeterminate" : value >= max ? "complete" : "loading";

	return (
		<span
			data-scope="progress"
			data-part="label"
			data-state={state}
			class={cx(styles.label, classProp)}
			{...rest}
		>
			{children}
		</span>
	);
}

export function Track(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const { styles, value, max, orientation } = useProgressContext();
	const state =
		value === null ? "indeterminate" : value >= max ? "complete" : "loading";

	return (
		<div
			data-scope="progress"
			data-part="track"
			data-state={state}
			data-orientation={orientation}
			class={cx(styles.track, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

export function Range(
	props: PropsWithChildren<{ class?: string; style?: any }>,
) {
	const { children, class: classProp, style, ...rest } = props;
	const { styles, value, min, max, orientation } = useProgressContext();
	const state =
		value === null ? "indeterminate" : value >= max ? "complete" : "loading";

	const percent =
		value === null
			? undefined
			: Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

	const rangeStyle = {
		...style,
		[orientation === "horizontal" ? "width" : "height"]:
			percent !== undefined ? `${percent}%` : undefined,
	};

	return (
		<div
			data-scope="progress"
			data-part="range"
			data-state={state}
			data-orientation={orientation}
			class={cx(styles.range, classProp)}
			style={rangeStyle}
			{...rest}
		>
			{children}
		</div>
	);
}

export function ValueText(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const { styles, value, max, min } = useProgressContext();
	const state =
		value === null ? "indeterminate" : value >= max ? "complete" : "loading";

	const percent =
		value === null ? 0 : Math.round(((value - min) / (max - min)) * 100);

	return (
		<span
			data-scope="progress"
			data-part="value-text"
			data-state={state}
			class={cx(styles.valueText, classProp)}
			{...rest}
		>
			{children || (value === null ? null : `${percent}%`)}
		</span>
	);
}

export interface ViewProps
	extends PropsWithChildren<{
		state: "indeterminate" | "loading" | "complete";
		class?: string;
	}> {}

export function View(props: ViewProps) {
	const { children, state: targetState, class: classProp, ...rest } = props;
	const { styles, value, max } = useProgressContext();
	const currentState =
		value === null ? "indeterminate" : value >= max ? "complete" : "loading";

	if (currentState !== targetState) return null;

	return (
		<div
			data-scope="progress"
			data-part="view"
			data-state={currentState}
			class={cx(styles.view, classProp)}
			{...rest}
		>
			{children}
		</div>
	);
}

export function Circle(props: PropsWithChildren<{ class?: string }>) {
	const { children, class: classProp, ...rest } = props;
	const { styles, value, max } = useProgressContext();
	const state =
		value === null ? "indeterminate" : value >= max ? "complete" : "loading";

	return (
		<svg
			viewBox="0 0 100 100"
			data-scope="progress"
			data-part="circle"
			data-state={state}
			class={cx(styles.circle, classProp)}
			{...rest}
		>
			<title>Progress</title>
			{children}
		</svg>
	);
}

export function CircleTrack(
	props: PropsWithChildren<{ class?: string; style?: any }>,
) {
	const { class: classProp, ...rest } = props;
	const { styles } = useProgressContext();

	return (
		<circle
			cx="50"
			cy="50"
			r="40"
			fill="none"
			stroke-width="10"
			data-scope="progress"
			data-part="circle-track"
			class={cx(styles.circleTrack, classProp)}
			{...rest}
		/>
	);
}

export function CircleRange(
	props: PropsWithChildren<{ class?: string; style?: any }>,
) {
	const { class: classProp, style, ...rest } = props;
	const { styles, value, min, max } = useProgressContext();
	const state =
		value === null ? "indeterminate" : value >= max ? "complete" : "loading";

	const percent =
		value === null
			? 0
			: Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
	const circumference = 2 * Math.PI * 40;
	const offset = circumference - (percent / 100) * circumference;

	return (
		<circle
			cx="50"
			cy="50"
			r="40"
			fill="none"
			stroke-width="10"
			stroke-dasharray={`${circumference}`}
			stroke-dashoffset={`${offset}`}
			data-scope="progress"
			data-part="circle-range"
			data-state={state}
			class={cx(styles.circleRange, classProp)}
			style={{
				transition: "stroke-dashoffset 0.2s ease-in-out",
				...style,
			}}
			{...rest}
		/>
	);
}
