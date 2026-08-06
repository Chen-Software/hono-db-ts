// Stub for `bun:sqlite` so the Cloudflare Worker bundle can build.
// Only reached if `env.DB` is missing at runtime (never in a real deploy).
export const Database = class {
	constructor() {
		throw new Error(
			"bun:sqlite is not available in the Cloudflare Worker runtime",
		);
	}
};
