import type { JSX } from "hono/jsx";

export function PlayIcon(props: JSX.IntrinsicElements["svg"]) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="currentColor"
			{...props}
		>
			<title>Play</title>
			<path d="M8 5v14l11-7z" />
		</svg>
	);
}
