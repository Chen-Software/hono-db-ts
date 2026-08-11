import child_process from "node:child_process";

const originalSpawnSync = child_process.spawnSync;

// Monkey-patch spawnSync to fix Bun's bug when using numeric FDs with encoding
child_process.spawnSync = function (file: string, args: any, options: any) {
	if (options && options.stdio && Array.isArray(options.stdio)) {
		const stdout = options.stdio[1];
		const stderr = options.stdio[2];
		if (typeof stdout === "number" || typeof stderr === "number") {
			if (options.encoding) {
				const opts = { ...options };
				delete opts.encoding;
				return originalSpawnSync.call(this, file, args, opts);
			}
		}
	}
	return originalSpawnSync.apply(this, arguments as any);
} as any;

// Now load the original register hook
import "@ttsc/unplugin/bun-register";
