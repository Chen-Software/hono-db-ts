import { defineRecipe } from "@pandacss/dev";

const spanVariants: Record<string | number, unknown> = {
	"0": { display: "none" },
};
const offsetVariants: Record<string | number, unknown> = {};
const orderVariants: Record<string | number, unknown> = {};
const pullVariants: Record<string | number, unknown> = {};
const pushVariants: Record<string | number, unknown> = {};

for (let i = 1; i <= 24; i++) {
	const pct = `${(i / 24) * 100}%`;
	spanVariants[i] = {
		display: "block",
		flex: `0 0 ${pct}`,
		maxWidth: pct,
		width: pct,
	};
}

for (let i = 0; i <= 24; i++) {
	const pct = `${(i / 24) * 100}%`;
	offsetVariants[i] = {
		marginLeft: pct,
	};
	orderVariants[i] = {
		order: i,
	};
	pullVariants[i] = {
		right: pct,
		position: "relative",
	};
	pushVariants[i] = {
		left: pct,
		position: "relative",
	};
}

const gridCol = defineRecipe({
	className: "grid-col",
	base: {
		boxSizing: "border-box",
	},
	variants: {
		span: spanVariants,
		offset: offsetVariants,
		order: orderVariants,
		pull: pullVariants,
		push: pushVariants,
	},
});

export { gridCol };
