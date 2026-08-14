import type { Child } from "hono/jsx";
import {
	Circle,
	CircleRange,
	CircleTrack,
	Label,
	Range,
	Root,
	type RootProps,
	Track,
	ValueText,
} from "./progress-primitive";

export interface ProgressProps extends RootProps {
	/**
	 * The label to display.
	 */
	label?: Child;
	/**
	 * Whether to show the value text.
	 * @default false
	 */
	showValueText?: boolean;
	/**
	 * The custom value text to display.
	 */
	valueText?: Child;
	/**
	 * The type of progress to display.
	 * @default 'linear'
	 */
	type?: "linear" | "circular";
}

export const Progress = (props: ProgressProps) => {
	const { label, showValueText, valueText, type = "linear", ...rest } = props;

	return (
		<Root {...rest}>
			{label && <Label>{label}</Label>}
			{type === "linear" ? (
				<Track>
					<Range />
				</Track>
			) : (
				<Circle>
					<CircleTrack />
					<CircleRange />
				</Circle>
			)}
			{showValueText && <ValueText>{valueText}</ValueText>}
		</Root>
	);
};
