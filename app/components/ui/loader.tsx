import { css } from "design-system/css";
import type { Child, PropsWithChildren } from "hono/jsx";
import { Spinner } from "./spinner";

export interface LoaderProps extends PropsWithChildren {
	spinner?: Child;
	text?: Child;
	spinnerPlacement?: "start" | "end";
}

export function Loader(props: LoaderProps) {
	const {
		spinner = <Spinner size="inherit" />,
		text,
		spinnerPlacement = "start",
		children,
	} = props;

	return (
		<div
			class={css({
				display: "inline-flex",
				alignItems: "center",
				gap: "2",
				justifyContent: "center",
			})}
		>
			{spinnerPlacement === "start" && (
				<div class={css({ display: "flex", flexShrink: "0" })}>{spinner}</div>
			)}
			{text || children}
			{spinnerPlacement === "end" && (
				<div class={css({ display: "flex", flexShrink: "0" })}>{spinner}</div>
			)}
		</div>
	);
}
