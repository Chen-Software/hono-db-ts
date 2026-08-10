/**
 * Legacy re-export shim — the application-layer `PostService` now lives in
 * `../application/post-service`. The old version was a Hono app; the REST
 * adapter is now `../transport/post-controller`. Kept so old import paths keep
 * resolving; delete once every consumer imports the new path.
 */
export {
	PostService,
	type PostServiceOptions,
	PostNotFoundError,
	PostAlreadyExistsError,
	InvalidInputError,
} from "../application/post-service";
