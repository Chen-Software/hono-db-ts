import { InteractiveAvatar } from "../../islands/avatar";
import { AvatarBase, type AvatarBaseProps } from "./avatar-primitive";
import { shouldHydrate } from "./island-utils";

export interface AvatarProps extends AvatarBaseProps {
	interactive?: boolean;
}

export function Avatar(props: AvatarProps) {
	const { interactive, ...rest } = props;

	// Hydrate the interactive avatar when an async image (src) needs client-side
	// loading/error handling, or when interactive is explicitly requested.
	if (shouldHydrate(interactive, Boolean(rest.src))) {
		return <InteractiveAvatar {...rest} />;
	}

	return <AvatarBase {...rest} />;
}
