import { env } from "./envs" with { type: "macros" };

const _env = env();
const isDev = _env === "development";
const isProd = _env === "production";

export { _env as env, isDev, isProd};
