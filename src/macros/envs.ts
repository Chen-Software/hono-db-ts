function env() {
	return process.env.NODE_ENV ?? "development";
}

function isDev() {
	return process.env.NODE_ENV === "development";
}

export { env, isDev };
