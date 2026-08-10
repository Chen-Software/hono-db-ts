/**
 * Legacy re-export shim — the application-layer `UserService` now lives in
 * `../application/user-service` (see there for the architecture rationale).
 * Kept so old import paths keep resolving; delete once every consumer imports
 * the new path.
 */
export {
	UserService,
	type UserServiceOptions,
} from "../application/user-service";
