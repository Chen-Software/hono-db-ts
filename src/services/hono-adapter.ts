/**
 * Legacy re-export shim — the REST adapter for `UserService` now lives in
 * `../transport/user-controller`. Kept so old import paths keep resolving;
 * delete once every consumer imports the new path.
 */
export { userServiceApp } from "../transport/user-controller";
