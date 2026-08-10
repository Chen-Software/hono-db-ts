/**
 * `PostAssetStore` — the application-owned PORT for post media.
 *
 * This is the deliberately *business-shaped* alternative to exposing a generic
 * `BlobStore` (`put` / `get` / `delete`) to every service. The application asks
 * for what it needs: "store this image for this post", "delete this image".
 * The infrastructure adapter decides the key scheme, the backend (S3, R2, local
 * fs, memory), and the metadata encoding — none of which is the application's
 * business.
 */
export interface PostAsset {
	/** Asset id (opaque to the application). */
	id: string;
	/** The post this asset belongs to. */
	postId: string;
	/** Storage key (backend-internal; opaque to the application). */
	key: string;
	/** MIME type, e.g. `image/png`. */
	contentType: string;
	/** Payload size in bytes. */
	size: number;
}

/** An image being uploaded. */
export interface ImageUpload {
	/** Raw image bytes. */
	data: Uint8Array;
	/** MIME type, e.g. `image/png`. */
	contentType: string;
	/** Optional client-provided filename (informational). */
	name?: string;
}

export interface PostAssetStore {
	/** Store an image for a post; returns the recorded asset. */
	storeImage(postId: string, image: ImageUpload): Promise<PostAsset>;

	/** Delete an asset by id (no-op if it does not exist). */
	deleteImage(assetId: string): Promise<void>;
}
