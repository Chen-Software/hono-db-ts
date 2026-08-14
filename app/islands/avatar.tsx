import { useEffect, useState } from "hono/jsx";
import {
	AvatarBase,
	type AvatarBaseProps,
} from "../components/ui/avatar-primitive";

export function InteractiveAvatar(props: AvatarBaseProps) {
	const { src, ...rest } = props;
	const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">(
		src ? "loading" : "idle",
	);

	useEffect(() => {
		if (!src) {
			setStatus("idle");
			return;
		}

		setStatus("loading");
		const img = new Image();
		img.src = src;
		img.onload = () => setStatus("loaded");
		img.onerror = () => setStatus("error");
	}, [src]);

	return <AvatarBase {...rest} src={src} status={status} />;
}
