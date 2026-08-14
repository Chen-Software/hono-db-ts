import { cx } from "design-system/css";
import type { AlertVariantProps } from "design-system/recipes";
import { alert } from "design-system/recipes";
import type { Child } from "hono/jsx";

export interface AlertProps extends AlertVariantProps {
	title?: string;
	description?: string;
	indicator?: Child;
	children?: Child;
	class?: string;
	/**
	 * The aria-live setting of the alert.
	 * @default 'polite'
	 */
	"aria-live"?: "polite" | "assertive" | "off";
}

export function Alert(props: AlertProps) {
	const [variantProps, localProps] = alert.splitVariantProps(props);
	const styles = alert(variantProps);
	const {
		title,
		description,
		indicator,
		children,
		class: classProp,
		"aria-live": ariaLive = "polite",
		...restProps
	} = localProps;

	const hasContent = title || description || children;

	return (
		<div
			role="alert"
			aria-live={ariaLive}
			class={cx(styles.root, classProp)}
			{...restProps}
		>
			{indicator && <span class={styles.indicator}>{indicator}</span>}
			{hasContent && (
				<div class={styles.content}>
					{title && <h3 class={styles.title}>{title}</h3>}
					{description && <div class={styles.description}>{description}</div>}
					{children}
				</div>
			)}
		</div>
	);
}

import { InfoIcon } from "../../icons/info";

// Default info icon SVG for Alert indicator
export function AlertIcon() {
	return <InfoIcon />;
}
