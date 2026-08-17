/**
 * sha1 shim — workerd-safe replacement for `sha.js/sha1.js`.
 *
 * `sha.js` is CJS and pulls in `safe-buffer`/`to-buffer`/`inherits`, which at
 * module load call `createRequire(import.meta.url)("buffer")` — a bare-name
 * dynamic require the Workers runtime (`nodejs_compat`) cannot resolve, so the
 * worker crashes on boot. isomorphic-git only uses the browser build's Hash
 * class as `new Hash().update(data).digest('hex')`, which is exactly what
 * `node:crypto`'s synchronous `createHash('sha1')` provides (and the Workers
 * runtime does implement `node:crypto`). Alias `sha.js/sha1.js` to this module
 * in `vite.ui.cf.config.ts` and the whole CJS chain disappears from the bundle.
 */
import { createHash } from "node:crypto";

export default class Sha1 {
	private hash: ReturnType<typeof createHash>;

	constructor() {
		this.hash = createHash("sha1");
	}

	update(data: Uint8Array | string, enc?: string): this {
		this.hash.update(data as Buffer, enc as BufferEncoding);
		return this;
	}

	digest(enc?: "hex" | "base64" | "latin1" | "buffer"): string | Buffer {
		return this.hash.digest((enc ?? "buffer") as BufferEncoding);
	}
}
