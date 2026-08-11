import type {
	ImageUpload,
	PostAsset,
	PostAssetStore,
} from "../ports/asset-store";
import { type BlobStoreProvider, decodeJson, encodeJson } from "./blob-store";

/**
 * `LocalPostAssetStore` — an INFRASTRUCTURE adapter implementing the
 * `PostAssetStore` port over any `BlobStoreProvider` (S3, R2, local fs,
 * memory). Swapping the blob backend changes nothing for the application: it
 * only ever said `storeImage(postId, image)` / `deleteImage(assetId)`.
 *
 * Storage layout (backend-internal, invisible to the application):
 *   - `assets/<postId>/<assetId>.bin` — the raw image bytes;
 *   - `assets/<assetId>.meta`        — a JSON record of the asset (so
 *     `deleteImage` can resolve the key from just the asset id).
 */
export class LocalPostAssetStore implements PostAssetStore {
	private readonly prefix = "assets";

	constructor(private blob: BlobStoreProvider) {}

	async storeImage(postId: string, image: ImageUpload): Promise<PostAsset> {
		const id = crypto.randomUUID();
		const asset: PostAsset = {
			id,
			postId,
			key: `${this.prefix}/${postId}/${id}.bin`,
			contentType: image.contentType,
			size: image.data.byteLength,
		};
		await this.blob.put(asset.key, image.data);
		await this.blob.put(`${this.prefix}/${id}.meta`, encodeJson(asset));
		return asset;
	}

	async deleteImage(assetId: string): Promise<void> {
		const meta = await this.blob.get(`${this.prefix}/${assetId}.meta`);
		if (!meta) return;
		const asset = decodeJson(meta.data) as PostAsset;
		await this.blob.delete(asset.key);
		await this.blob.delete(`${this.prefix}/${assetId}.meta`);
	}
}
